"""Render sample-data UI exports for documentation. Optional dev dependencies only."""
from pathlib import Path
import subprocess
import sys
from PIL import Image
from weasyprint import HTML

source = Path(sys.argv[1]).resolve()
destination = Path(__file__).resolve().parent.parent / "docs"
destination.mkdir(exist_ok=True)
for name in ["interface-en", "interface-es", "walkthrough-1", "walkthrough-2", "walkthrough-3"]:
    pdf = source / (name + ".pdf")
    HTML(filename=str(source / (name + ".html"))).write_pdf(pdf)
    subprocess.run(["pdftoppm", "-singlefile", "-scale-to-x", "1000" if name.startswith("walkthrough") else "650", "-scale-to-y", "-1", "-png", str(pdf), str(source / name)], check=True, capture_output=True)
for name in ["interface-en", "interface-es"]:
    with Image.open(source / (name + ".png")) as picture:
        picture.save(destination / (name + ".png"), optimize=True)
frames = []
for name in ["walkthrough-1", "walkthrough-2", "walkthrough-3"]:
    with Image.open(source / (name + ".png")) as picture:
        frames.append(picture.convert("RGB").quantize(colors=160))
frames[0].save(destination / "walkthrough.gif", save_all=True, append_images=frames[1:], duration=[4200, 4200, 5200], loop=0, optimize=False, disposal=2)
print("Created English/Spanish PNG previews and a three-step illustrated GIF.")
