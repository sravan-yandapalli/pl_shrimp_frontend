import Image from "next/image";

export default function Navbar() {
  return (
    <nav className="w-full h-15 flex items-center justify-around shadow select-none">
      <button>
        <Image
          src="/icons/profile_.svg"
          alt="profile"
          width={24}
          height={24}
        />
      </button>

      <div>
        <Image 
          src="icons/logo_.svg" 
          alt="logo"
          width={124}
          height={30}
          />
      </div>

      <button>
        <Image
          src="icons/menu_.svg"
          alt="menu"
          width={24}
          height={24}
        />
      </button>
      
    </nav>
  );
}