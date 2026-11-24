"""Extract the Jezero landing-area terrain assets from the USGS CTX mosaics."""

import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

LATITUDE = 18.4447
LONGITUDE = 77.4508
MARS_RADIUS = 3396190
HALF_WIDTH = 6000
GRID_SIZE = 193
IMAGE_SIZE = 1024
ROOT = Path(__file__).resolve().parents[1]


def extract(path, size, standard_parallel, include_endpoints):
    with rasterio.open(path) as source:
        x = MARS_RADIUS * math.radians(LONGITUDE) * math.cos(math.radians(standard_parallel))
        y = MARS_RADIUS * math.radians(LATITUDE)
        half_x = HALF_WIDTH * math.cos(math.radians(standard_parallel)) / math.cos(math.radians(LATITUDE))
        half_y = HALF_WIDTH
        if include_endpoints:
            half_x *= size / (size - 1)
            half_y *= size / (size - 1)
        window = from_bounds(x - half_x, y - half_y, x + half_x, y + half_y, source.transform)
        image = source.read(1, window=window, out_shape=(size, size), resampling=Resampling.bilinear, masked=True)
        if np.ma.getmaskarray(image).any() or not np.isfinite(image).all():
            raise ValueError(f"{path} does not cover the complete Jezero extraction area")
        return np.asarray(image)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python tools/build-jezero-terrain.py JEZERO_DEM.tif JEZERO_ORTHO.tif")
    elevation = extract(sys.argv[1], GRID_SIZE, 18.4663, True)
    ortho = extract(sys.argv[2], IMAGE_SIZE, 0, False)
    rows = [",".join(f"{value:.1f}" for value in row) for row in elevation]
    output = (
        "// Derived from the USGS Mars 2020 CTX DEM; see README for source and processing.\n"
        f"export const JEZERO_GRID_SIZE = {GRID_SIZE};\n"
        "export const JEZERO_ELEVATIONS = [\n"
        + ",\n".join(rows) + "\n];\n"
    )
    (ROOT / "src" / "jezero-elevation.js").write_text(output, encoding="utf-8", newline="\n")
    Image.fromarray(ortho.astype(np.uint8)).save(ROOT / "assets" / "jezero-ctx.png", optimize=True)
    print(f"Extracted {GRID_SIZE} x {GRID_SIZE} elevations and {IMAGE_SIZE} x {IMAGE_SIZE} imagery.")


if __name__ == "__main__":
    main()
