import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("PIL (Pillow) is not installed. Attempting to install...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow"])
    from PIL import Image, ImageDraw

def create_icon(name, draw_fn):
    sizes = [(24, ''), (48, '@2x'), (72, '@3x')]
    for size, suffix in sizes:
        # Create a transparent image (RGBA)
        img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
        draw = ImageDraw.Draw(img)
        
        # Scale coords based on size
        scale = size / 24.0
        
        # Call drawing function
        draw_fn(draw, scale, size)
        
        # Save to assets/images/tabIcons
        output_dir = 'assets/images/tabIcons'
        os.makedirs(output_dir, exist_ok=True)
        img_path = os.path.join(output_dir, f"{name}{suffix}.png")
        img.save(img_path)
        print(f"Successfully generated {img_path}")

def draw_search(draw, scale, size):
    # Circle (Glass outline)
    r = 5.0 * scale
    cx, cy = 10 * scale, 10 * scale
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 255), width=max(1, int(2 * scale)))
    # Handle diagonal line
    draw.line([14 * scale, 14 * scale, 19 * scale, 19 * scale], fill=(255, 255, 255, 255), width=max(1, int(2 * scale)))

def draw_create(draw, scale, size):
    # Circle outline border
    r = 8.5 * scale
    cx, cy = 12 * scale, 12 * scale
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 255), width=max(1, int(2 * scale)))
    # Plus cross lines
    draw.line([12 * scale, 7 * scale, 12 * scale, 17 * scale], fill=(255, 255, 255, 255), width=max(1, int(2 * scale)))
    draw.line([7 * scale, 12 * scale, 17 * scale, 12 * scale], fill=(255, 255, 255, 255), width=max(1, int(2 * scale)))

def draw_map(draw, scale, size):
    # Panel fold coordinates
    # panel 1: (4, 4) -> (10, 6) -> (10, 20) -> (4, 18)
    p = [
        (4 * scale, 6 * scale),
        (9 * scale, 3 * scale),
        (15 * scale, 6 * scale),
        (20 * scale, 3 * scale),
        (20 * scale, 18 * scale),
        (15 * scale, 21 * scale),
        (9 * scale, 18 * scale),
        (4 * scale, 21 * scale)
    ]
    # Draw outline perimeter
    draw.line([p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[0]], fill=(255, 255, 255, 255), width=max(1, int(2 * scale)), joint="round")
    # Draw inner fold vertical dividers
    draw.line([p[1], p[6]], fill=(255, 255, 255, 255), width=max(1, int(1.5 * scale)))
    draw.line([p[2], p[5]], fill=(255, 255, 255, 255), width=max(1, int(1.5 * scale)))

def draw_chat(draw, scale, size):
    # Rounded rectangular speech bubble
    # Using arc drawing since older PIL versions don't support rounded_rectangle
    # Draw rect (3, 4) to (21, 16)
    draw.rectangle([4 * scale, 4 * scale, 20 * scale, 15 * scale], outline=(255, 255, 255, 255), width=max(1, int(2 * scale)))
    # Pointer triangle at bottom left: (7, 15) -> (5, 19) -> (12, 15)
    draw.polygon([
        (6 * scale, 15 * scale),
        (5 * scale, 19 * scale),
        (10 * scale, 15 * scale)
    ], fill=(255, 255, 255, 255))

def draw_profile(draw, scale, size):
    # User profile head
    r = 3.5 * scale
    cx, cy = 12 * scale, 8 * scale
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 255), width=max(1, int(2 * scale)))
    # User profile shoulders arc
    draw.arc([4 * scale, 13 * scale, 20 * scale, 25 * scale], start=180, end=360, fill=(255, 255, 255, 255), width=max(1, int(2 * scale)))

if __name__ == '__main__':
    create_icon('search', draw_search)
    create_icon('create', draw_create)
    create_icon('map', draw_map)
    create_icon('chat', draw_chat)
    create_icon('profile', draw_profile)
    print("All icons successfully generated in assets/images/tabIcons/")
