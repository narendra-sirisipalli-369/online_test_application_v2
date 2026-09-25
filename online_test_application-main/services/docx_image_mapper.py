"""Extract embedded DOCX images and associate them with extracted question rows."""

from __future__ import annotations

import re
import shutil
import subprocess
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff"}
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
OCR_SCRIPT = Path(__file__).with_name("ocr_option_image.swift")


def resolve_row_images(docx_path: str, rows: list[dict], output_dir: str, safe_doc_name: str) -> None:
    """Copy supported embedded images to the import asset directory.

    DOCX stores images under ``word/media``. The reader records the drawing
    sequence when possible; the same sequence is used here to set image paths.
    """
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    image_paths: dict[int, Path] = {}

    with zipfile.ZipFile(docx_path) as document:
        relationships = ET.fromstring(document.read("word/_rels/document.xml.rels"))
        relationship_targets = {item.attrib.get("Id", ""): item.attrib.get("Target", "") for item in relationships.findall(f"{{{REL_NS}}}Relationship")}
        document_xml = ET.fromstring(document.read("word/document.xml"))
        drawing_sources: dict[int, str] = {}
        for index, drawing in enumerate(document_xml.findall(f".//{{{WORD_NS}}}drawing"), start=1):
            blip = drawing.find(f".//{{{DRAWING_NS}}}blip")
            relation_id = blip.attrib.get(f"{{{OFFICE_REL_NS}}}embed", "") if blip is not None else ""
            source_name = f"word/{relationship_targets.get(relation_id, '').lstrip('/')}"
            if Path(source_name).suffix.lower() in IMAGE_EXTENSIONS:
                drawing_sources[index] = source_name
        copied_images: dict[str, Path] = {}
        for source_name in dict.fromkeys(drawing_sources.values()):
            suffix = Path(source_name).suffix.lower()
            output_name = f"{_safe_name(safe_doc_name)}_image_{len(copied_images) + 1}{suffix}"
            output_path = destination / output_name
            with document.open(source_name) as source, output_path.open("wb") as target:
                shutil.copyfileobj(source, target)
            copied_images[source_name] = output_path

        for index, source_name in drawing_sources.items():
            image_path = copied_images.get(source_name)
            if image_path is not None:
                image_paths[index] = image_path

    for row in rows:
        image_index = row.pop("_image_index", None)
        image_path = image_paths.get(image_index)
        if image_path is not None:
            row["image_path"] = str(image_path)
            row["image_preview_path"] = str(image_path)
        option_images = row.pop("_option_images", [])
        row["_option_image_paths"] = [
            {"keys": item.get("keys", []), "path": str(image_paths[item["index"]])}
            for item in option_images if item.get("index") in image_paths
        ]


def extract_text_from_image(image_path: str) -> str:
    if not OCR_SCRIPT.is_file():
        return ""
    try:
        result = subprocess.run(["/usr/bin/swift", str(OCR_SCRIPT), image_path], capture_output=True, text=True, timeout=30)
        return " ".join(result.stdout.split()) if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def _safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", value).strip("_") or "document"
