import json
import os
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: preprocess_docx.py <docx_path> <output_dir>")

    docx_path = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    backend_root = Path(__file__).resolve().parents[4]
    sys.path.insert(0, str(backend_root))

    from services.docx_reader import DocxReader
    from services.validator import Validator
    from services.docx_image_mapper import extract_text_from_image, resolve_row_images

    reader = DocxReader()
    reader.load(str(docx_path))
    rows, reader_issues = reader.extract()
    validator = Validator()
    validation_issues = validator.validate_data(rows)
    issues = reader_issues + validation_issues

    safe_doc_name = docx_path.stem.replace(" ", "_")
    resolve_row_images(str(docx_path), rows, str(output_dir), safe_doc_name)

    for row in rows:
      for option_image in row.pop("_option_image_paths", []):
          ocr_text = extract_text_from_image(option_image["path"])
          for option_key in option_image.get("keys", []):
              if ocr_text:
                  row[option_key] = f"{row.get(option_key, '').strip()} {ocr_text}".strip()
      image_path = row.get("image_path")
      preview_path = row.get("image_preview_path")
      if image_path:
          try:
              row["image_relative_path"] = os.path.relpath(image_path, str(output_dir))
          except ValueError:
              row["image_relative_path"] = image_path
      if preview_path:
          try:
              row["image_preview_relative_path"] = os.path.relpath(preview_path, str(output_dir))
          except ValueError:
              row["image_preview_relative_path"] = preview_path

    payload = {
        "questions": rows,
        "issues": issues,
        "tables": reader.extracted_tables,
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()