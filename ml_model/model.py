# ==============================================================================
# 1. INSTALL DEPENDENCIES & IMPORTS
# ==============================================================================
!pip install -q ultralytics sahi

import os
import glob
import cv2
import shutil
import zipfile
import numpy as np
import matplotlib.pyplot as plt
from ultralytics import YOLO
from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction
from google.colab import files

# ==============================================================================
# 2. ROBUST EXTRACTION & DIRECTORY SETUP
# ==============================================================================
base_dir = '/content/shrimp_project'
img_dir = f'{base_dir}/data/images/train'
lbl_dir = f'{base_dir}/data/labels/train'

# Create the exact directories YOLO needs
os.makedirs(img_dir, exist_ok=True)
os.makedirs(lbl_dir, exist_ok=True)

zip_path = '/content/shrimp_project.zip'
temp_extract_dir = '/content/temp_dataset'

print(f"\n📦 Extracting {zip_path}...")
if os.path.exists(zip_path):
    # Extract everything to a temporary folder
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(temp_extract_dir)
    
    # Search through the extracted files and move them to the correct YOLO folders
    img_count = 0
    lbl_count = 0
    for root, dirs, extracted_files in os.walk(temp_extract_dir):
        for file in extracted_files:
            file_path = os.path.join(root, file)
            # If it's an image, move to images/train
            if file.lower().endswith(('.png', '.jpg', '.jpeg')):
                shutil.move(file_path, os.path.join(img_dir, file))
                img_count += 1
            # If it's a label (and not a random text file like classes.txt), move to labels/train
            elif file.lower().endswith('.txt') and file not in ['classes.txt', 'readme.txt']:
                shutil.move(file_path, os.path.join(lbl_dir, file))
                lbl_count += 1

    print(f"✅ Successfully routed {img_count} images and {lbl_count} labels to YOLO folders.")
    
    # Clean up the temp folder
    shutil.rmtree(temp_extract_dir)
else:
    print("❌ ERROR: shrimp_project.zip not found in /content/")

# ==============================================================================
# 3. GENERATE DATA.YAML CONFIGURATION
# ==============================================================================
yaml_content = f"""
path: {base_dir}
train: data/images/train
val: data/images/train

names:
  0: shrimp
"""
yaml_path = os.path.join(base_dir, 'data.yaml')
with open(yaml_path, 'w') as f:
    f.write(yaml_content)

print("✅ data.yaml configured.")

# ==============================================================================
# 4. TRAIN YOLOv8 OPTIMIZED FOR DENSE TINY OBJECTS
# ==============================================================================
os.chdir(base_dir)

print("\n🚀 Starting training with high-resolution and small-object settings...")
base_model = YOLO('yolov8n.pt')

train_results = base_model.train(
    data=yaml_path,
    epochs=120,          # Allows model to reach high recall (>80%)
    imgsz=1280,          # High resolution preserves tiny shrimp details
    batch=4,             # Fits cleanly in GPU VRAM
    mosaic=0.0,          # Crucial: disables mosaic so tiny shrimp don't shrink
    mixup=0.0,
    degrees=10.0,        # Rotation augmentation
    save=True,
    project=f'{base_dir}/runs/detect',
    name='train_dense_shrimp'
)

# ==============================================================================
# 5. LOCATE THE TRAINED WEIGHTS
# ==============================================================================
model_weight_path = f'{base_dir}/runs/detect/train_dense_shrimp/weights/best.pt'

if not os.path.exists(model_weight_path):
    # Fallback to search if trained under an incremented folder name
    search_files = glob.glob(f'{base_dir}/runs/detect/**/weights/best.pt', recursive=True)
    if search_files:
        model_weight_path = max(search_files, key=os.path.getctime)

print(f"\n✅ Using trained model: {model_weight_path}")

# ==============================================================================
# 6. RUN SAHI SLICED INFERENCE ON TEST IMAGE
# ==============================================================================
test_image_path = '/content/s_2.jpeg'  # Assuming uploaded to main directory

if not os.path.exists(test_image_path):
    # Check alternate location inside data folder
    alt_path = f'{base_dir}/data/images/train/s_2.jpeg'
    if os.path.exists(alt_path):
        test_image_path = alt_path

print(f"\n🔍 Running SAHI magnified slice detection on: {test_image_path}")

# Load model into SAHI engine
detection_model = AutoDetectionModel.from_pretrained(
    model_type='yolov8',
    model_path=model_weight_path,
    confidence_threshold=0.20,  # Balanced threshold for high detection rate
    device="cuda:0",
)

# Sliced prediction
result = get_sliced_prediction(
    test_image_path,
    detection_model,
    slice_height=384,
    slice_width=384,
    overlap_height_ratio=0.2,
    overlap_width_ratio=0.2,
)

# ==============================================================================
# 7. OUTPUT SHRIMP COUNT & CUSTOM VISUALIZATION
# ==============================================================================
total_shrimp = len(result.object_prediction_list)

print("\n" + "="*40)
print(f"🦐 FINAL ACCURATE SHRIMP COUNT: {total_shrimp} 🦐")
print("="*40 + "\n")

# Load original test image
orig_img = cv2.imread(test_image_path)
vis_dots = orig_img.copy()
vis_boxes = orig_img.copy()

# Draw clean dots and thin boxes (no text clutter)
for obj in result.object_prediction_list:
    bbox = obj.bbox.to_xyxy()
    x1, y1, x2, y2 = map(int, bbox)
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

    # Draw small bright green dot at shrimp center
    cv2.circle(vis_dots, (cx, cy), radius=3, color=(0, 255, 0), thickness=-1)

    # Draw ultra-thin bounding box
    cv2.rectangle(vis_boxes, (x1, y1), (x2, y2), color=(0, 255, 0), thickness=1)

# Convert BGR to RGB for Matplotlib
vis_dots_rgb = cv2.cvtColor(vis_dots, cv2.COLOR_BGR2RGB)
vis_boxes_rgb = cv2.cvtColor(vis_boxes, cv2.COLOR_BGR2RGB)

# Display comparisons side-by-side
fig, axes = plt.subplots(1, 2, figsize=(20, 10))

axes[0].imshow(vis_dots_rgb)
axes[0].set_title(f"Centroid Dots (Count: {total_shrimp})", fontsize=16)
axes[0].axis('off')

axes[1].imshow(vis_boxes_rgb)
axes[1].set_title(f"Thin Bounding Boxes (Count: {total_shrimp})", fontsize=16)
axes[1].axis('off')

plt.tight_layout()
plt.show()

# ==============================================================================
# 8. ZIP AND DOWNLOAD THE TRAINED MODEL FOLDER
# ==============================================================================
# Zip the entire training run folder to get best.pt along with training graphs
run_dir = os.path.dirname(os.path.dirname(model_weight_path))
zip_filename = f'{base_dir}/shrimp_model_export'

print(f"\n📦 Zipping the trained model and logs from {run_dir}...")
shutil.make_archive(zip_filename, 'zip', run_dir)

print(f"✅ Created {zip_filename}.zip")
print("⬇️ Triggering download...")
files.download(f'{zip_filename}.zip')