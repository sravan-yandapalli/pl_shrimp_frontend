import random
import time
import json
import threading

from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

import boto3
import requests

from PIL import Image, ImageOps
from botocore.config import Config
from concurrent.futures import ThreadPoolExecutor, as_completed


# ============================================================
# DIZIAQUA LOAD TEST
# ============================================================

BASE_URL = "https://diziaqua.online"

SOURCE_DIR = Path(
    r"E:\SHNPL_PROJECT\images"
)

DYNAMODB_TABLE = "DiziAquaMetadata"

REGION = "ap-south-1"

S3_BUCKET_NAME = "diziaqua-images-320698389233"


# ============================================================
# BATCH CONFIGURATION
# ============================================================
#
# CHANGE ONLY THESE VALUES FOR EACH BATCH.
#
# B1:
#   BATCH_ID = "B1_1K_50C"
#   TOTAL_USERS = 50
#   IMAGES_PER_USER = 20
#   MAX_WORKERS = 50
#
# B2:
#   BATCH_ID = "B2_5K_100C"
#   TOTAL_USERS = 100
#   IMAGES_PER_USER = 50
#   MAX_WORKERS = 100
#
# B3:
#   BATCH_ID = "B3_10K_200C"
#   TOTAL_USERS = 200
#   IMAGES_PER_USER = 50
#   MAX_WORKERS = 200
#
# B4:
#   BATCH_ID = "B4_24K_100C"
#   TOTAL_USERS = 200
#   IMAGES_PER_USER = 120
#   MAX_WORKERS = 100
#
# ============================================================

# -------- CURRENT BATCH: START WITH B1 --------
BATCH_ID = "B2_5K_100C"

TOTAL_USERS = 100
IMAGES_PER_USER = 50

MAX_WORKERS = 100


# ============================================================
# IMPORTANT: DO NOT RESET OLD TEST DATA
# ============================================================

# False = keep all previous batches.
#
# Only change this to True when you intentionally want
# to delete THIS SAME BATCH_ID and rerun it.
RESET_LOAD_TEST_DATA = False


# Each batch gets a unique dataset type.
DATASET_TYPE = f"LOAD_TEST_{BATCH_ID}"

DYNAMODB_GROUP = "USERS"


# ============================================================
# S3 ORGANIZATION
# ============================================================

UPLOAD_PREFIX = "USERS/U"

ANNOTATION_PREFIX = "USERS/A"


# ============================================================
# IMAGE SETTINGS
# ============================================================

RANDOM_SEED = 20260916

# Same as frontend gallery upload.
JPEG_QUALITY = 98


# ============================================================
# RETRY SETTINGS
# ============================================================

UPLOAD_URL_MAX_ATTEMPTS = 5

UPLOAD_MAX_ATTEMPTS = 4

CAPTURE_MAX_ATTEMPTS = 5

DYNAMODB_MAX_ATTEMPTS = 5

BACKOFF_BASE_SECONDS = 1.5


# ============================================================
# LOG FILES
# ============================================================

FAILURE_LOG_FILE = Path(
    f"load_test_failures_{BATCH_ID}.jsonl"
)

SUMMARY_LOG_FILE = Path(
    f"load_test_summary_{BATCH_ID}.json"
)


# Thread-safe file lock.
failure_log_lock = threading.Lock()


# ============================================================
# AWS CLIENTS
# ============================================================

aws_config = Config(
    region_name=REGION,
    retries={
        "max_attempts": 5,
        "mode": "adaptive",
    },
)


dynamodb = boto3.resource(
    "dynamodb",
    region_name=REGION,
)

table = dynamodb.Table(
    DYNAMODB_TABLE
)


s3 = boto3.client(
    "s3",
    config=aws_config,
)


# ============================================================
# VALIDATION
# ============================================================

def validate_config():
    if TOTAL_USERS <= 0:
        raise ValueError("TOTAL_USERS must be greater than 0.")

    if IMAGES_PER_USER <= 0:
        raise ValueError(
            "IMAGES_PER_USER must be greater than 0."
        )

    if MAX_WORKERS <= 0:
        raise ValueError(
            "MAX_WORKERS must be greater than 0."
        )

    if MAX_WORKERS > TOTAL_USERS:
        print(
            "WARNING: MAX_WORKERS is greater than TOTAL_USERS. "
            "This is allowed, but unnecessary."
        )

    total_images = (
        TOTAL_USERS * IMAGES_PER_USER
    )

    if not BATCH_ID.strip():
        raise ValueError("BATCH_ID cannot be empty.")

    print()
    print("Configuration validated.")
    print(f"Batch ID:       {BATCH_ID}")
    print(f"Total images:   {total_images}")
    print(f"Users:          {TOTAL_USERS}")
    print(f"Images/user:    {IMAGES_PER_USER}")
    print(f"Concurrency:    {MAX_WORKERS}")
    print()


# ============================================================
# RETRY BACKOFF
# ============================================================

def sleep_backoff(attempt: int):
    """
    Exponential backoff with small random jitter.

    attempt=0 -> ~1.5s
    attempt=1 -> ~3s
    attempt=2 -> ~6s
    """
    delay = (
        BACKOFF_BASE_SECONDS
        * (2 ** attempt)
    )

    jitter = random.uniform(
        0,
        0.5
    )

    time.sleep(delay + jitter)


# ============================================================
# SOURCE IMAGES
# ============================================================

def get_source_images():
    if not SOURCE_DIR.exists():
        raise FileNotFoundError(
            f"Source folder not found: {SOURCE_DIR}"
        )

    images = sorted(
        [
            p
            for p in SOURCE_DIR.iterdir()
            if p.is_file()
            and p.suffix.lower()
            in {".jpg", ".jpeg"}
        ],
        key=lambda p: p.name.lower(),
    )

    if not images:
        raise RuntimeError(
            "No JPG/JPEG images found."
        )

    print(
        f"Found {len(images)} source images."
    )

    return images


# ============================================================
# FAILURE LOGGING
# ============================================================

def log_failure(
    user_number: int,
    image_number: int,
    source_image: Path,
    error: Exception,
):
    record = {
        "timestamp": datetime.now(
            timezone.utc
        ).isoformat(),

        "batch_id": BATCH_ID,

        "user_number": user_number,

        "user_id": (
            f"{BATCH_ID}_USER_"
            f"{user_number:04d}"
        ),

        "image_number": image_number,

        "image_id": (
            f"IMG_{image_number:06d}"
        ),

        "source_image": source_image.name,

        "error_type": type(error).__name__,

        "error": str(error),
    }

    with failure_log_lock:
        with FAILURE_LOG_FILE.open(
            "a",
            encoding="utf-8",
        ) as file:
            file.write(
                json.dumps(
                    record,
                    ensure_ascii=False,
                )
                + "\n"
            )


# ============================================================
# RESET THIS BATCH ONLY
# ============================================================

def reset_load_test_data():
    if not RESET_LOAD_TEST_DATA:
        print(
            "Reset disabled. Existing test data will be kept."
        )
        return

    print()
    print(
        f"Resetting ONLY batch: {DATASET_TYPE}"
    )

    paginator = table.meta.client.get_paginator(
        "scan"
    )

    deleted_metadata = 0

    deleted_s3 = 0

    for page in paginator.paginate(
        TableName=DYNAMODB_TABLE,

        FilterExpression=(
            "#d = :dataset "
            "AND #g = :group"
        ),

        ExpressionAttributeNames={
            "#d": "dataset_type",
            "#g": "group",
        },

        ExpressionAttributeValues={
            ":dataset": DATASET_TYPE,
            ":group": DYNAMODB_GROUP,
        },

        ProjectionExpression=(
            "user_id, image_id"
        ),
    ):

        for item in page.get(
            "Items",
            [],
        ):

            user_id = item["user_id"]

            image_id = item["image_id"]

            upload_key = (
                f"{UPLOAD_PREFIX}/"
                f"{user_id}/"
                f"{image_id}.jpg"
            )

            annotation_key = (
                f"{ANNOTATION_PREFIX}/"
                f"{user_id}/"
                f"{image_id}.jpg"
            )

            try:
                s3.delete_objects(
                    Bucket=S3_BUCKET_NAME,

                    Delete={
                        "Objects": [
                            {
                                "Key": upload_key
                            },
                            {
                                "Key": annotation_key
                            },
                        ]
                    },
                )

                deleted_s3 += 2

            except Exception as error:
                print(
                    "WARNING: S3 delete failed "
                    f"for {user_id}/{image_id}: "
                    f"{error}"
                )

            try:
                table.delete_item(
                    Key={
                        "user_id": user_id,
                        "image_id": image_id,
                    }
                )

                deleted_metadata += 1

            except Exception as error:
                print(
                    "WARNING: DynamoDB delete failed "
                    f"for {user_id}/{image_id}: "
                    f"{error}"
                )

    print(
        f"Deleted metadata: {deleted_metadata}"
    )

    print(
        f"Deleted S3 objects: {deleted_s3}"
    )


# ============================================================
# GET PRESIGNED UPLOAD URL
# ============================================================

def get_upload_url():

    last_error = None

    for attempt in range(
        UPLOAD_URL_MAX_ATTEMPTS
    ):

        try:

            response = requests.post(
                f"{BASE_URL}/api/upload-url",

                json={
                    "contentType": "image/jpeg"
                },

                timeout=30,
            )

            # Retry only temporary server/rate errors.
            if response.status_code in {
                429,
                500,
                502,
                503,
                504,
            }:

                if (
                    attempt
                    < UPLOAD_URL_MAX_ATTEMPTS - 1
                ):

                    print(
                        f"upload-url returned "
                        f"{response.status_code}; "
                        f"retrying..."
                    )

                    sleep_backoff(attempt)

                    continue

            response.raise_for_status()

            data = response.json()

            if data.get("success") is not True:
                raise RuntimeError(
                    f"/api/upload-url failed: {data}"
                )

            return data

        except requests.RequestException as error:

            last_error = error

            if (
                attempt
                < UPLOAD_URL_MAX_ATTEMPTS - 1
            ):

                sleep_backoff(attempt)

            else:
                raise

        except ValueError as error:

            raise RuntimeError(
                "/api/upload-url returned "
                f"invalid JSON: {error}"
            ) from error

    raise RuntimeError(
        f"Could not get upload URL: {last_error}"
    )


# ============================================================
# PREPARE IMAGE
# ============================================================

def prepare_image(
    image_path: Path
) -> bytes:

    with Image.open(image_path) as image:

        image = ImageOps.exif_transpose(
            image
        )

        # Largest centered square.
        source_size = min(
            image.width,
            image.height,
        )

        source_x = (
            image.width - source_size
        ) // 2

        source_y = (
            image.height - source_size
        ) // 2

        cropped = image.crop(
            (
                source_x,
                source_y,
                source_x + source_size,
                source_y + source_size,
            )
        )

        if cropped.mode != "RGB":
            cropped = cropped.convert(
                "RGB"
            )

        output = BytesIO()

        cropped.save(
            output,
            format="JPEG",
            quality=JPEG_QUALITY,
            optimize=False,
        )

        return output.getvalue()


# ============================================================
# S3 UPLOAD
# ============================================================

def upload_image(
    upload_url: str,
    image_bytes: bytes,
):

    for attempt in range(
        UPLOAD_MAX_ATTEMPTS
    ):

        try:

            response = requests.put(
                upload_url,

                data=image_bytes,

                headers={
                    "Content-Type": "image/jpeg"
                },

                timeout=120,
            )

            # Retry temporary failures.
            if response.status_code in {
                429,
                500,
                502,
                503,
                504,
            }:

                if (
                    attempt
                    < UPLOAD_MAX_ATTEMPTS - 1
                ):

                    print(
                        f"S3 upload returned "
                        f"{response.status_code}; "
                        f"retrying..."
                    )

                    sleep_backoff(attempt)

                    continue

            response.raise_for_status()

            return

        except requests.RequestException:

            if (
                attempt
                == UPLOAD_MAX_ATTEMPTS - 1
            ):
                raise

            sleep_backoff(attempt)

    raise RuntimeError(
        "S3 upload failed."
    )


# ============================================================
# CAPTURE / SAGEMAKER
# ============================================================

def process_image(
    bucket: str,
    key: str,
):

    last_error = None

    for attempt in range(
        CAPTURE_MAX_ATTEMPTS
    ):

        try:

            response = requests.post(
                f"{BASE_URL}/api/capture",

                json={
                    "bucket": bucket,
                    "key": key,
                },

                timeout=180,
            )

            # These are normally temporary conditions.
            if response.status_code in {
                429,
                500,
                502,
                503,
                504,
            }:

                if (
                    attempt
                    < CAPTURE_MAX_ATTEMPTS - 1
                ):

                    print(
                        f"/api/capture returned "
                        f"{response.status_code}; "
                        f"retrying..."
                    )

                    sleep_backoff(attempt)

                    continue

            response.raise_for_status()

            try:
                data = response.json()

            except ValueError as error:

                raise RuntimeError(
                    "/api/capture returned "
                    f"invalid JSON: {error}"
                ) from error

            if data.get("success") is not True:

                raise RuntimeError(
                    f"/api/capture failed: {data}"
                )

            return data

        except requests.RequestException as error:

            last_error = error

            if (
                attempt
                < CAPTURE_MAX_ATTEMPTS - 1
            ):

                print(
                    f"/api/capture request error: "
                    f"{error}; retrying..."
                )

                sleep_backoff(attempt)

            else:

                raise

    raise RuntimeError(
        f"/api/capture failed after retries: "
        f"{last_error}"
    )


# ============================================================
# FIND ANNOTATED S3 KEY
# ============================================================

def key_from_annotated_result(
    result: dict
) -> str:

    # Preferred direct key.
    direct_key = (
        result.get("annotated_key")
        or result.get("annotatedKey")
    )

    if (
        isinstance(direct_key, str)
        and direct_key
    ):
        return direct_key.lstrip("/")

    annotated_url = (
        result.get("annotatedImageUrl")
        or result.get("annotated_image_url")
        or result.get("imageUrl")
        or ""
    )

    if (
        not isinstance(
            annotated_url,
            str,
        )
        or not annotated_url
    ):
        return ""

    return urlparse(
        annotated_url
    ).path.lstrip("/")


# ============================================================
# MOVE S3 OBJECT
# ============================================================

def move_s3_object(
    bucket: str,
    source_key: str,
    destination_key: str,
):

    if not source_key:

        raise RuntimeError(
            "Missing S3 source key."
        )

    if (
        source_key
        == destination_key
    ):
        return

    s3.copy_object(
        Bucket=bucket,

        CopySource={
            "Bucket": bucket,
            "Key": source_key,
        },

        Key=destination_key,
    )

    s3.delete_object(
        Bucket=bucket,
        Key=source_key,
    )


# ============================================================
# SAVE DYNAMODB METADATA
# ============================================================

def save_metadata(
    user_number: int,
    image_number: int,
    source_image: Path,
    bucket: str,
    upload_key: str,
    result: dict,
    uploaded_size_bytes: int,
):

    user_id = (
        f"{BATCH_ID}_USER_"
        f"{user_number:04d}"
    )

    image_id = (
        f"IMG_{image_number:06d}"
    )

    shrimp_count = result.get(
        "shrimp_count",

        result.get(
            "count",
            0,
        ),
    )

    processing_time = result.get(
        "processingTimeMs",
        0,
    )

    item = {

        # Primary keys.
        "user_id": user_id,
        "image_id": image_id,

        # Batch information.
        "batch_id": BATCH_ID,
        "group": DYNAMODB_GROUP,
        "dataset_type": DATASET_TYPE,

        # Test user information.
        "username": (
            f"{BATCH_ID}_user_"
            f"{user_number:04d}"
        ),

        "email": (
            f"{BATCH_ID.lower()}_user_"
            f"{user_number:04d}"
            "@example.test"
        ),

        # Image information.
        "source_filename": (
            source_image.name
        ),

        "image_name": (
            f"{image_id}.jpg"
        ),

        "created_at": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),

        # Test location.
        "latitude": Decimal(
            "17.686800"
        ),

        "longitude": Decimal(
            "83.218500"
        ),

        # S3 information.
        "s3_bucket": bucket,

        "upload_key": upload_key,

        # Image size.
        "source_size_bytes": Decimal(
            str(uploaded_size_bytes)
        ),

        # Model result.
        "shrimp_count": Decimal(
            str(shrimp_count)
        ),

        "processing_status": (
            "completed"
        ),

        "model_endpoint": result.get(
            "endpoint",
            "shrimp-yolo-v2-prod",
        ),

        "processing_time_ms": Decimal(
            str(processing_time)
        ),
    }


    # DynamoDB retry.
    for attempt in range(
        DYNAMODB_MAX_ATTEMPTS
    ):

        try:

            table.put_item(
                Item=item
            )

            return

        except Exception:

            if (
                attempt
                == DYNAMODB_MAX_ATTEMPTS - 1
            ):
                raise

            sleep_backoff(attempt)


# ============================================================
# PROCESS ONE IMAGE
# ============================================================

def process_one(
    user_number: int,
    image_number: int,
    source_image: Path,
):

    user_id = (
        f"{BATCH_ID}_USER_"
        f"{user_number:04d}"
    )

    image_id = (
        f"IMG_{image_number:06d}"
    )

    start = time.time()

    print(
        f"[{user_id}/{image_id}] "
        f"{source_image.name}"
    )


    # --------------------------------------------------------
    # 1. Get presigned upload URL.
    # --------------------------------------------------------

    upload_data = get_upload_url()

    upload_url = upload_data[
        "uploadUrl"
    ]

    bucket = upload_data[
        "bucket"
    ]

    temporary_upload_key = upload_data[
        "key"
    ]


    # --------------------------------------------------------
    # 2. Prepare image.
    # --------------------------------------------------------

    image_bytes = prepare_image(
        source_image
    )


    # --------------------------------------------------------
    # 3. Upload image.
    # --------------------------------------------------------

    upload_image(
        upload_url,
        image_bytes,
    )

    print(
        f"[{image_id}] uploaded "
        f"({len(image_bytes) / 1024 / 1024:.2f} MB)"
    )


    # --------------------------------------------------------
    # 4. Capture -> backend -> SageMaker.
    # --------------------------------------------------------

    result = process_image(
        bucket,
        temporary_upload_key,
    )


    shrimp_count = result.get(
        "shrimp_count",

        result.get(
            "count",
            0,
        ),
    )

    print(
        f"[{image_id}] SageMaker count = "
        f"{shrimp_count}"
    )


    # --------------------------------------------------------
    # 5. Organize S3.
    # --------------------------------------------------------

    organized_upload_key = (
        f"{UPLOAD_PREFIX}/"
        f"{user_id}/"
        f"{image_id}.jpg"
    )

    original_annotated_key = (
        key_from_annotated_result(
            result
        )
    )

    if not original_annotated_key:

        raise RuntimeError(
            "SageMaker completed but "
            "no annotated S3 key was returned."
        )

    organized_annotated_key = (
        f"{ANNOTATION_PREFIX}/"
        f"{user_id}/"
        f"{image_id}.jpg"
    )


    move_s3_object(
        bucket,
        temporary_upload_key,
        organized_upload_key,
    )


    move_s3_object(
        bucket,
        original_annotated_key,
        organized_annotated_key,
    )


    print(
        f"[{image_id}] S3 organized"
    )

    print(
        f"    {organized_upload_key}"
    )

    print(
        f"    {organized_annotated_key}"
    )


    # --------------------------------------------------------
    # 6. Save DynamoDB metadata.
    # --------------------------------------------------------

    save_metadata(
        user_number=user_number,
        image_number=image_number,
        source_image=source_image,
        bucket=bucket,
        upload_key=organized_upload_key,
        result=result,
        uploaded_size_bytes=len(
            image_bytes
        ),
    )


    elapsed = (
        time.time() - start
    )

    print(
        f"[{image_id}] DynamoDB saved "
        f"({elapsed:.2f}s)"
    )

    return True


# ============================================================
# PROCESS ONE USER
# ============================================================

def process_user(
    user_number: int,
    source_images_for_user: list[Path],
):

    base_image_number = (
        (user_number - 1)
        * IMAGES_PER_USER
    )

    user_completed = 0

    for offset, source_image in enumerate(
        source_images_for_user
    ):

        image_number = (
            base_image_number
            + offset
            + 1
        )

        try:

            process_one(
                user_number=user_number,
                image_number=image_number,
                source_image=source_image,
            )

            user_completed += 1

        except Exception as error:

            print()

            print(
                f"FAILED "
                f"{BATCH_ID}/"
                f"USER_{user_number:04d}/"
                f"IMG_{image_number:06d}: "
                f"{error}"
            )

            log_failure(
                user_number=user_number,
                image_number=image_number,
                source_image=source_image,
                error=error,
            )

    return user_completed


# ============================================================
# MAIN
# ============================================================

def main():

    validate_config()


    total_images = (
        TOTAL_USERS
        * IMAGES_PER_USER
    )


    print()
    print("============================================")
    print("DIZIAQUA LOAD TEST")
    print("============================================")

    print(
        f"Batch ID:               {BATCH_ID}"
    )

    print(
        f"Dataset type:           {DATASET_TYPE}"
    )

    print(
        f"Users:                  {TOTAL_USERS}"
    )

    print(
        f"Images per user:        {IMAGES_PER_USER}"
    )

    print(
        f"Total images:           {total_images}"
    )

    print(
        f"Max concurrent users:   {MAX_WORKERS}"
    )

    print(
        f"Max concurrent jobs:    {MAX_WORKERS}"
    )

    print(
        f"DynamoDB table:         {DYNAMODB_TABLE}"
    )

    print(
        "DynamoDB metadata:      uploaded-image metadata only"
    )

    print(
        f"S3 uploads:             "
        f"{UPLOAD_PREFIX}/{BATCH_ID}_USER_xxxx/"
    )

    print(
        f"S3 annotations:         "
        f"{ANNOTATION_PREFIX}/{BATCH_ID}_USER_xxxx/"
    )

    print(
        f"Backend:                {BASE_URL}"
    )

    print(
        f"Reset this batch:       {RESET_LOAD_TEST_DATA}"
    )

    print(
        f"Failure log:            {FAILURE_LOG_FILE}"
    )

    print("============================================")


    # --------------------------------------------------------
    # Source images.
    # --------------------------------------------------------

    source_images = (
        get_source_images()
    )

    print(
        "Image preparation: "
        "center-square crop + JPEG quality 98"
    )


    # --------------------------------------------------------
    # Reset only if intentionally enabled.
    # --------------------------------------------------------

    reset_load_test_data()


    # --------------------------------------------------------
    # Create deterministic source assignment.
    # --------------------------------------------------------

    rng = random.Random(
        RANDOM_SEED
    )

    user_plans = {}

    for user_number in range(
        1,
        TOTAL_USERS + 1,
    ):

        user_plans[
            user_number
        ] = [

            rng.choice(
                source_images
            )

            for _ in range(
                IMAGES_PER_USER
            )

        ]


    print(
        f"Built source-image plan for "
        f"{TOTAL_USERS} users."
    )


    # --------------------------------------------------------
    # Start test.
    # --------------------------------------------------------

    print()

    print(
        f"Starting batch {BATCH_ID}"
    )

    print(
        f"{MAX_WORKERS} simultaneous users."
    )

    print(
        f"Each user sends 1 image at a time "
        f"until {IMAGES_PER_USER} images "
        f"are complete."
    )

    print()


    start_time = time.time()

    batch_start_iso = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )


    completed = 0

    failed_users = 0


    # --------------------------------------------------------
    # Parallel users.
    # --------------------------------------------------------

    with ThreadPoolExecutor(
        max_workers=MAX_WORKERS
    ) as executor:

        future_to_user = {

            executor.submit(
                process_user,

                user_number,

                user_plans[
                    user_number
                ],
            ):
                user_number

            for user_number in range(
                1,
                TOTAL_USERS + 1,
            )
        }


        for future in as_completed(
            future_to_user
        ):

            user_number = (
                future_to_user[
                    future
                ]
            )

            try:

                user_completed = (
                    future.result()
                )

                completed += (
                    user_completed
                )

                if (
                    user_completed
                    != IMAGES_PER_USER
                ):

                    failed_users += 1


                print()

                print(
                    f"{BATCH_ID} "
                    f"USER_{user_number:04d} "
                    f"finished: "
                    f"{user_completed}/"
                    f"{IMAGES_PER_USER}"
                )

            except Exception as error:

                failed_users += 1

                print()

                print(
                    f"USER_{user_number:04d} "
                    f"failed completely: "
                    f"{error}"
                )


    # --------------------------------------------------------
    # Final statistics.
    # --------------------------------------------------------

    elapsed = (
        time.time() - start_time
    )

    failed_images = (
        total_images
        - completed
    )

    success_rate = (
        completed / total_images * 100
        if total_images > 0
        else 0
    )

    avg_wall_clock_per_image = (
        elapsed / completed
        if completed > 0
        else 0
    )


    batch_end_iso = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )


    summary = {

        "batch_id": BATCH_ID,

        "dataset_type": DATASET_TYPE,

        "start_time_utc": batch_start_iso,

        "end_time_utc": batch_end_iso,

        "total_images": total_images,

        "successful_images": completed,

        "failed_images": failed_images,

        "success_rate_percent": (
            round(
                success_rate,
                4
            )
        ),

        "users": TOTAL_USERS,

        "images_per_user": (
            IMAGES_PER_USER
        ),

        "max_workers": MAX_WORKERS,

        "failed_users": failed_users,

        "elapsed_seconds": elapsed,

        "elapsed_minutes": (
            elapsed / 60
        ),

        "wall_clock_seconds_per_success": (
            avg_wall_clock_per_image
        ),

        "failure_log": str(
            FAILURE_LOG_FILE
        ),
    }


    with SUMMARY_LOG_FILE.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            summary,
            file,
            indent=2,
        )


    print()

    print("============================================")
    print("LOAD TEST COMPLETE")
    print("============================================")

    print(
        f"Batch:             {BATCH_ID}"
    )

    print(
        f"Total images:      {total_images}"
    )

    print(
        f"Successful:        {completed}"
    )

    print(
        f"Failed:            {failed_images}"
    )

    print(
        f"Success rate:      {success_rate:.2f}%"
    )

    print(
        f"Users with failure:{failed_users}"
    )

    print(
        f"Time:              {elapsed / 60:.2f} minutes"
    )

    print(
        f"Failure log:       {FAILURE_LOG_FILE}"
    )

    print(
        f"Summary file:      {SUMMARY_LOG_FILE}"
    )

    print("============================================")


if __name__ == "__main__":
    main()