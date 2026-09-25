"""Validation for rows returned by the DOCX question extractor."""

from __future__ import annotations


class Validator:
    def validate_data(self, rows: list[dict]) -> list[dict]:
        issues: list[dict] = []
        seen_numbers: set[str] = set()

        for index, row in enumerate(rows, start=1):
            section = row.get("section") or "Unsectioned"
            number = str(row.get("actual_number") or row.get("question_number") or index)
            question = str(row.get("question") or "").strip()
            options = [str(row.get(f"option_{key}") or "").strip() for key in "abcd"]
            has_options = any(options)
            key = str(row.get("key") or "").strip()

            if number in seen_numbers:
                issues.append(self._issue(section, number, "duplicate_question_number", number, "Renumber this question before approving it."))
            seen_numbers.add(number)

            if not question:
                issues.append(self._issue(section, number, "missing_question", "", "Add the question text in the Question bank review."))

            if has_options and not all(options):
                missing = ", ".join(key.upper() for key, value in zip("abcd", options) if not value)
                issues.append(self._issue(section, number, "incomplete_options", missing, "Provide all four answer options or convert the question to text-answer type."))

            if has_options and key and key.upper() not in {"A", "B", "C", "D"}:
                issues.append(self._issue(section, number, "invalid_option_key", key, "Set the answer key to A, B, C, or D."))

        return issues

    @staticmethod
    def _issue(section: str, question_number: str, issue_type: str, detected_value: str, suggested_fix: str) -> dict:
        return {
            "section": section,
            "question_number": question_number,
            "issue_type": issue_type,
            "detected_value": detected_value,
            "suggested_fix": suggested_fix,
        }
    