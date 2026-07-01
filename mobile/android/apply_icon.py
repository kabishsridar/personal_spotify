import os
from PIL import Image, ImageDraw

src_path = r"C:\Users\kabis\.gemini\antigravity\brain\9c968868-09a5-4dc5-b8ef-307ac66beaa6\music_app_icon_1779009999159.png"
res_dir = r"d:\spotify_firstcopy\mob_final\android\app\src\main\res"

sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192
}

# Open source image
img = Image.open(src_path)

for folder, size in sizes.items():
    folder_path = os.path.join(res_dir, folder)
    if not os.path.exists(folder_path):
        os.makedirs(folder_path)
        
    # Resize image
    resized_img = img.resize((size, size), Image.Resampling.LANCZOS)
    
    # Save standard icon
    resized_img.save(os.path.join(folder_path, "ic_launcher.png"), "PNG")
    
    # Save round icon
    # To make it round, apply a circle mask
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    
    round_img = Image.new("RGBA", (size, size))
    round_img.paste(resized_img, (0, 0), mask=mask)
    round_img.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")
    
    print(f"Applied icon to {folder} ({size}x{size})")

# Remove adaptive icons to force PNG usage
anydpi_path = os.path.join(res_dir, "mipmap-anydpi-v26")
if os.path.exists(anydpi_path):
    for filename in os.listdir(anydpi_path):
        filepath = os.path.join(anydpi_path, filename)
        try:
            os.remove(filepath)
            print(f"Removed adaptive XML: {filename}")
        except Exception as e:
            print(f"Could not remove {filename}: {e}")
    try:
        os.rmdir(anydpi_path)
        print("Removed mipmap-anydpi-v26 folder")
    except Exception as e:
        print(f"Could not remove folder: {e}")
