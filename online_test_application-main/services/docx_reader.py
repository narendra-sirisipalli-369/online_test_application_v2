"""Dependency-free DOCX question extractor used by the API import workflow."""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": WORD_NS}


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


class DocxReader:
    """Read passages, questions, options, tables, and answer keys from a DOCX."""

    def __init__(self) -> None:
        self.docx_path: Path | None = None
        self.root: ET.Element | None = None
        self.extracted_tables: list[dict] = []

    def load(self, docx_path: str) -> None:
        self.docx_path = Path(docx_path)
        if not self.docx_path.is_file():
            raise FileNotFoundError(f"DOCX file was not found: {self.docx_path}")
        with zipfile.ZipFile(self.docx_path) as document:
            self.root = ET.fromstring(document.read("word/document.xml"))

    def extract(self) -> tuple[list[dict], list[dict]]:
        if self.root is None:
            raise RuntimeError("Call load() before extract().")

        rows: list[dict] = []
        issues: list[dict] = []
        table_keys: dict[str, str] = {}
        passage_parts: list[str] = []
        pending: dict | None = None
        range_start: int | None = None
        next_number: int | None = None
        section = "Unsectioned"
        image_index = 0
        shared_image_index: int | None = None
        questions_started = False
        blank_after_question = False
        list_counters: dict[tuple[str, str], int] = {}

        def append_passage(text: str) -> None:
            if text:
                passage_parts.append(text)

        def flush_question() -> None:
            nonlocal pending
            if pending is None:
                return
            pending["paragraph"] = "\n\n".join(passage_parts).strip()
            pending.pop("_last_option_key", None)
            pending["actual_number"] = pending.get("actual_number") or str(len(rows) + 1)
            pending["section"] = section
            rows.append(pending)
            pending = None

        body = self.root.find(".//w:body", NS)
        if body is None:
            return rows, [{"section": section, "issue_type": "invalid_document", "detected_value": "Missing document body", "suggested_fix": "Upload a valid DOCX file."}]

        for node in body:
            tag = node.tag.rsplit("}", 1)[-1]
            if tag == "tbl":
                table = self._read_table(node)
                table_id = f"T{len(self.extracted_tables) + 1}"
                self.extracted_tables.append({"id": table_id, "rows": table})
                table_keys.update(self._answer_keys_from_table(table))
                if pending is not None:
                    # Tables following a question belong to that question only when
                    # there is no active shared passage.
                    pending["question"] = f"{pending['question']}\n\nTableJSON: {json.dumps({table_id: table}, ensure_ascii=False)}"
                else:
                    append_passage(f"TableJSON: {json.dumps({table_id: table}, ensure_ascii=False)}")
                continue

            if tag != "p":
                continue

            raw_text = self._paragraph_text(node)
            list_label = self._next_list_label(node, list_counters)
            text = f"{list_label} {raw_text}" if list_label and raw_text else raw_text
            drawings = len(node.findall(".//w:drawing", NS))
            first_image = image_index + 1 if drawings else None
            image_index += drawings
            if not text:
                if first_image is not None:
                    if pending is not None:
                        if pending.get("_last_option_key"):
                            pending.setdefault("_option_images", []).append({"index": first_image, "keys": [pending["_last_option_key"]]})
                        else:
                            pending.setdefault("_image_index", first_image)
                    elif section != "Unsectioned":
                        shared_image_index = shared_image_index or first_image
                blank_after_question = pending is not None
                continue

            direction = self._direction_range(text)
            if direction:
                flush_question()
                range_start, range_end = direction
                next_number = range_start
                section = f"Questions {range_start}-{range_end}"
                passage_parts = [text]
                shared_image_index = None
                questions_started = False
                blank_after_question = False
                continue

            if text.upper() == "KEY":
                flush_question()
                continue

            option_values = self._options_from_text(text)
            if option_values:
                if pending is None:
                    issues.append({
                        "section": section,
                        "issue_type": "orphan_options",
                        "detected_value": text,
                        "suggested_fix": "Place answer options immediately after their question.",
                    })
                else:
                    pending.update(option_values)
                    pending["_last_option_key"] = list(option_values)[-1]
                    if first_image is not None:
                        pending.setdefault("_option_images", []).append({
                            "index": first_image,
                            "keys": [key for key, value in option_values.items() if not value] or list(option_values),
                        })
                blank_after_question = False
                continue

            # Use the unlabelled source text to identify questions. Word stores
            # shared-passage facts and question numbers as numbered lists; using
            # the rendered "1." prefix here would turn every fact into a question.
            starts_question = self._is_question(raw_text) or (
                questions_started and (
                    pending is None
                    or blank_after_question
                    or self._looks_like_question_prompt(raw_text)
                    or any(pending.get(f"option_{key}") for key in "abcd")
                )
            )
            if starts_question:
                flush_question()
                number, question_text = self._strip_question_number(raw_text)
                actual_number = number or (str(next_number) if next_number is not None else str(len(rows) + 1))
                if number is None and next_number is not None:
                    next_number += 1
                elif number is not None:
                    try:
                        next_number = int(number) + 1
                    except ValueError:
                        pass
                pending = {
                    "actual_number": actual_number,
                    "paragraph": "",
                    "question": question_text,
                    "option_a": "",
                    "option_b": "",
                    "option_c": "",
                    "option_d": "",
                    "key": "",
                    "topic": "",
                }
                if first_image is not None or shared_image_index is not None:
                    pending["_image_index"] = first_image or shared_image_index
                questions_started = True
                blank_after_question = False
                continue

            if not questions_started:
                append_passage(text)
                if first_image is not None:
                    shared_image_index = shared_image_index or first_image
            elif pending is not None:
                pending["question"] = f"{pending['question']} {text}".strip()
            blank_after_question = False

        flush_question()

        for row in rows:
            row["key"] = table_keys.get(str(row["actual_number"]), "")
            if not row["key"]:
                issues.append({
                    "section": row["section"],
                    "question_number": row["actual_number"],
                    "issue_type": "missing_answer_key",
                    "detected_value": "",
                    "suggested_fix": "Add the answer key in the Question bank review.",
                })

        return rows, issues

    @staticmethod
    def _paragraph_text(node: ET.Element) -> str:
        parts: list[str] = []
        for child in node.iter():
            local_name = child.tag.rsplit("}", 1)[-1]
            if local_name == "t" and child.text:
                parts.append(child.text)
            elif local_name in {"tab", "br", "cr"}:
                parts.append(" ")
        return clean_text("".join(parts))

    def _read_table(self, table_node: ET.Element) -> list[list[str]]:
        table: list[list[str]] = []
        for row in table_node.findall("./w:tr", NS):
            cells = [self._paragraph_text(cell) for cell in row.findall("./w:tc", NS)]
            table.append(cells)
        return table

    @staticmethod
    def _next_list_label(node: ET.Element, counters: dict[tuple[str, str], int]) -> str:
        """Return a visible decimal list marker for Word-numbered paragraphs."""
        number_props = node.find("./w:pPr/w:numPr", NS)
        if number_props is None:
            return ""
        number_id = number_props.find("./w:numId", NS)
        level = number_props.find("./w:ilvl", NS)
        if number_id is None:
            return ""
        key = (number_id.get(f"{{{WORD_NS}}}val", ""), level.get(f"{{{WORD_NS}}}val", "0") if level is not None else "0")
        counters[key] = counters.get(key, 0) + 1
        return f"{counters[key]}."

    @staticmethod
    def _direction_range(text: str) -> tuple[int, int] | None:
        match = re.search(r"\bDirections?\s*\(\s*(\d+)\s*[-–]\s*(\d+)\s*\)", text, re.IGNORECASE)
        return (int(match.group(1)), int(match.group(2))) if match else None

    @staticmethod
    def _is_question(text: str) -> bool:
        if text.endswith("?") or bool(re.match(r"^\s*\d+\s*[.)]\s+", text)):
            return True
        # Some source papers include follow-up statements after the question
        # mark (for example, "Which... false? Statement A: ...").
        return bool(re.match(r"^(?:What|Which|How|Who|When|Where|On which|In \d{4}, what)\b.*\?", text, re.IGNORECASE))

    @staticmethod
    def _looks_like_question_prompt(text: str) -> bool:
        """Recognize source-paper prompts that omit a final question mark."""
        return bool(re.match(
            r"^(?:What|Which|How|Who|When|Where|On which|Object\s+o\d+|The\s+COMPLETE\s+list|The\s+sequence).*(?:\?|:|\bto)$",
            text.strip(),
            re.IGNORECASE,
        ))

    @staticmethod
    def _strip_question_number(text: str) -> tuple[str | None, str]:
        match = re.match(r"^\s*(\d+)\s*[.)]\s+(.+)$", text)
        return (match.group(1), match.group(2).strip()) if match else (None, text.strip())

    @staticmethod
    def _options_from_text(text: str) -> dict[str, str]:
        markers = list(re.finditer(r"\(\s*([A-Da-d])\s*\)", text))
        if not markers:
            return {}
        values: dict[str, str] = {}
        for index, marker in enumerate(markers):
            end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
            values[f"option_{marker.group(1).lower()}"] = clean_text(text[marker.end():end])
        return values

    @staticmethod
    def _answer_keys_from_table(table: list[list[str]]) -> dict[str, str]:
        keys: dict[str, str] = {}
        for index in range(0, len(table) - 1, 2):
            numbers, answers = table[index], table[index + 1]
            if not numbers or not all(cell.strip().isdigit() for cell in numbers if cell.strip()):
                continue
            for number, answer in zip(numbers, answers):
                if number.strip() and answer.strip():
                    keys[number.strip()] = clean_text(answer)
        return keys
