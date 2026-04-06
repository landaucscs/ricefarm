#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Extract English reading passages from 수능/모의고사 PDFs.
Uses column-aware extraction to handle two-column layout.
Saves structured JSON to extracted_passages.json.
"""

import pdfplumber
import json
import re
import os

PDF_DIR = "c:/Users/JH/Desktop/2026 Reboot/기출/"
OUTPUT_PATH = "c:/Users/JH/Desktop/2026 Reboot/ricemachine/seed-data/extracted_passages.json"

EXAMS = ["2306", "2309", "2311", "2406", "2409", "2411",
         "2506", "2509", "2511", "2606", "2609", "2611"]

TARGET_QUESTIONS = [20, 21, 22, 23, 24, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]

QUESTION_TYPES = {
    20: "claim", 21: "implication", 22: "gist", 23: "topic", 24: "title",
    29: "grammar", 30: "vocabulary",
    31: "blank", 32: "blank", 33: "blank", 34: "blank",
    35: "irrelevant",
    36: "order", 37: "order",
    38: "insertion", 39: "insertion",
    40: "summary",
    41: "title_jangmun", 42: "vocabulary_jangmun"
}

# Questions that span both columns (they start in one column but bleed across due to layout)
# In these PDFs, each question is entirely within one column
# The two columns are independent question-by-question

# Questions where circled numbers ①②③④⑤ are PART of the passage body (not answer choices)
CIRCLES_IN_PASSAGE = {29, 30, 35, 38, 39}


def is_korean_char(ch):
    """Return True if character is a Korean (Hangul) character."""
    cp = ord(ch)
    return (44032 <= cp <= 55203 or   # Hangul syllables
            12593 <= cp <= 12686 or   # Hangul Jamo
            12800 <= cp <= 12830 or   # Hangul Compatibility Jamo
            43360 <= cp <= 43388 or   # Hangul Jamo Extended-A
            55216 <= cp <= 55291)     # Hangul Jamo Extended-B


def is_allowed_unicode(ch):
    """Return True if non-ASCII character is intentionally kept."""
    cp = ord(ch)
    allowed = [
        (0x2018, 0x201F),   # smart quotes
        (0x2013, 0x2015),   # en/em dash, horizontal bar
        (0x2026, 0x2026),   # ellipsis
        (0x00B7, 0x00B7),   # middle dot
        (0x00D7, 0x00D7),   # multiplication sign
        (0x2460, 0x2473),   # circled numbers ①-⑳
        (0x00C0, 0x024F),   # Latin extended (accented letters)
        (0x0391, 0x03C9),   # Greek letters
        (0x2010, 0x2027),   # general punctuation
        (0x00A0, 0x00BF),   # non-breaking space etc.
        (0x25A0, 0x25FF),   # geometric shapes (☓◯ etc used in tables)
        (0x2190, 0x21FF),   # arrows
        (0x2200, 0x22FF),   # math operators
        (0x00B0, 0x00B0),   # degree sign
        (0x2032, 0x2033),   # prime signs
        (0x0300, 0x036F),   # combining diacritics
    ]
    for start, end in allowed:
        if start <= cp <= end:
            return True
    return False


def clean_korean_from_text(text):
    """Remove Korean characters and garbled characters; preserve English + allowed Unicode."""
    result = []
    for ch in text:
        if is_korean_char(ch):
            result.append(' ')
        elif ord(ch) > 127 and not is_allowed_unicode(ch):
            result.append(' ')
        else:
            result.append(ch)
    cleaned = ''.join(result)
    return cleaned


def extract_column_texts(pdf_path, max_pages=8):
    """
    Extract text from each page, treating each page as two columns.
    Returns list of (left_text, right_text) tuples per page.
    """
    columns = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            if i >= max_pages:
                break
            w = page.width
            h = page.height
            # Small margin from edges and use full width split at midpoint
            # Some PDFs have page numbers at top; start from y=30 to skip
            left_col = page.crop((0, 0, w * 0.50, h))
            right_col = page.crop((w * 0.50, 0, w, h))

            left_text = left_col.extract_text() or ""
            right_text = right_col.extract_text() or ""
            columns.append((left_text, right_text))
    return columns


def find_question_blocks(columns, target_questions):
    """
    Scan all column texts for target questions.
    Returns dict: {q_num: raw_text_block}

    Strategy:
    - Concatenate ALL column texts into a single ordered stream
    - Each column text is scanned for question number anchors
    - We interleave left columns before right columns within each page
    """
    # Build ordered sequence: for each page, left col then right col
    all_segments = []
    for page_i, (left, right) in enumerate(columns):
        all_segments.append(("L", page_i, left))
        all_segments.append(("R", page_i, right))

    # Find which segment each target question lives in
    # A question "NN." starts at line beginning in its column
    q_locations = {}  # q_num -> (seg_index, char_offset)

    for seg_i, (side, page_i, text) in enumerate(all_segments):
        # Look for question numbers at line start
        for q_num in sorted(TARGET_QUESTIONS + list(range(18, 45)), reverse=True):
            # Pattern: at start of line or after newline, then number then period
            pattern = re.compile(r'(?:^|\n)\s*(' + str(q_num) + r')\.\s', re.MULTILINE)
            for m in pattern.finditer(text):
                if q_num not in q_locations:
                    q_locations[q_num] = (seg_i, m.start(), text)
                elif (seg_i, m.start()) < (q_locations[q_num][0], q_locations[q_num][1]):
                    q_locations[q_num] = (seg_i, m.start(), text)

    # Special handling for Q41/Q42: their shared passage is between the
    # [41～42] set header and the "41." question stem.
    # We extract the passage from the [41～42] header to the "41." marker.
    jangmun_passage = {}
    for seg_i, (side, page_i, text) in enumerate(all_segments):
        # Look for [41～42] or [41~42] marker
        jangmun_match = re.search(r'\[41[～~]42\]', text)
        if jangmun_match:
            header_end = jangmun_match.end()
            # Find "41." question marker after the header
            q41_match = re.search(r'\n\s*41\.\s', text[header_end:])
            if q41_match:
                passage_end = header_end + q41_match.start()
                raw_passage = text[header_end:passage_end]
                jangmun_passage[seg_i] = raw_passage
            else:
                # No "41." found in same segment; passage is rest of segment
                jangmun_passage[seg_i] = text[header_end:]
            break  # Use first occurrence only

    # For each target question, extract the block from the column text
    # up to the next question found in the same column
    blocks = {}

    for q_num in TARGET_QUESTIONS:
        # Q41 and Q42 share the passage extracted from the [41～42] header
        if q_num in (41, 42) and jangmun_passage:
            seg_i = list(jangmun_passage.keys())[0]
            blocks[q_num] = list(jangmun_passage.values())[0]
            continue

        if q_num not in q_locations:
            continue

        seg_i, start_pos, col_text = q_locations[q_num]

        # Find the next question in the SAME segment (column)
        next_q_start = len(col_text)
        for other_q in sorted(TARGET_QUESTIONS + list(range(18, 45))):
            if other_q == q_num:
                continue
            if other_q not in q_locations:
                continue
            other_seg, other_pos, _ = q_locations[other_q]
            if other_seg == seg_i and other_pos > start_pos:
                if other_pos < next_q_start:
                    next_q_start = other_pos

        block = col_text[start_pos:next_q_start]
        blocks[q_num] = block

    return blocks


def is_mostly_english(text):
    """Return True if text is mostly English letters."""
    letters = re.findall(r'[a-zA-Z]', text)
    total = len(text.replace(' ', '').replace('\n', ''))
    if total == 0:
        return False
    return len(letters) / total > 0.5


def remove_standalone_choice_lines(text):
    """
    Remove lines that are standalone answer choices (① Korean text).
    Keep lines where circles are embedded in English text.
    """
    lines = text.split('\n')
    result = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            result.append(line)
            continue

        # Check if line is mostly a standalone choice:
        # Pattern: starts with circle number, then mostly Korean (now spaces after cleaning)
        circle_match = re.match(r'^([①②③④⑤])\s*(.*)', stripped)
        if circle_match:
            after_circle = circle_match.group(2)
            # Check English ratio in content after circle
            eng = len(re.findall(r'[a-zA-Z]', after_circle))
            total_after = len(after_circle.replace(' ', ''))
            if total_after > 0 and eng / total_after < 0.4:
                # Mostly Korean/spaces = standalone choice line, skip
                continue
            elif total_after == 0:
                continue  # Empty after circle
        result.append(line)
    return '\n'.join(result)


def extract_passage_from_block(block, q_num):
    """
    Given a raw text block for a question, extract the clean English passage.
    """
    # Step 1: Clean Korean characters
    cleaned = clean_korean_from_text(block)

    # Step 2: Remove the question stem prefix but KEEP any English passage text
    # that starts on the same line as the question number.
    # Pattern: "NN. [Korean instruction] [optional English start]"
    # After Korean cleaning, Korean becomes spaces. We keep English content on the line.
    def strip_q_stem_line(text, q_num):
        # Strip leading whitespace/newlines first
        text = text.lstrip('\n ')
        first_newline = text.find('\n')
        if first_newline == -1:
            first_line = text
            rest = ''
        else:
            first_line = text[:first_newline]
            rest = text[first_newline:]
        # Remove the "NN." prefix and any immediately following spaces/Korean-derived spaces
        stripped = re.sub(r'^\s*\d+\.\s*', '', first_line)
        # For Q31-34 (blank) and Q40 (summary): the first line contains the question number
        # followed by English passage start. But since there's no Korean instruction
        # (it's purely "31. [English passage]"), we need to keep it.
        # However, for Q40, the first line is "40. [Korean]. (A), (B) ?" - discard Korean parts.
        if q_num in (31, 32, 33, 34):
            # The entire first line after "NN." is English passage start
            # "stripped" already has "31. " removed by the re.sub above
            # Just return the cleaned first line + rest
            return stripped.strip() + rest
            # Note: "stripped" = re.sub(r'^\s*\d+\.\s*', '', first_line) so no "31." prefix
        # Count English letters on this stripped line
        eng_count = len(re.findall(r'[a-zA-Z]', stripped))
        total_non_space = len(stripped.replace(' ', ''))
        if eng_count > 10 and total_non_space > 0 and eng_count / total_non_space > 0.5:
            # This line has substantial English - keep it as start of passage
            return stripped.strip() + rest
        else:
            # No/little English on this line - discard it
            return rest.lstrip('\n')
    cleaned = strip_q_stem_line(cleaned, q_num)

    # Additional cleanup for Q40: remove the Korean question stem which spans 2 lines
    # After Korean stripping: "40. . (A),\n(B) ?\nMobilities in transit..."
    if q_num == 40:
        # Remove lines that contain ONLY "(A)", "(B)", "?", ".", spaces etc (no real English words)
        lines_q40 = cleaned.split('\n')
        result_q40 = []
        found_passage = False
        for line in lines_q40:
            if not found_passage:
                # Check if this line has real English words (not just single letters/scaffolding)
                real_words = re.findall(r'\b[a-zA-Z]{3,}\b', line)
                if real_words:
                    found_passage = True
                    result_q40.append(line)
            else:
                result_q40.append(line)
        cleaned = '\n'.join(result_q40).strip()

    # Step 3: Collapse excessive whitespace in each line but preserve line breaks
    lines = cleaned.split('\n')
    lines = [re.sub(r'  +', ' ', l) for l in lines]
    cleaned = '\n'.join(lines)

    # Step 4: Remove annotation markers like [3 ] or [3점] -> [3 ] after Korean strip
    cleaned = re.sub(r'\[\s*3\s*\]', '', cleaned)
    cleaned = re.sub(r'\[\s*\d+\s*\]', '', cleaned)

    # Step 5: Remove footnotes like "*word: definition" (Korean defs stripped to spaces)
    cleaned = re.sub(r'\n\s*\*+[a-zA-Z\s]+:\s*[^\n]*', '', cleaned)

    # Step 6: Question-type specific processing
    if q_num in CIRCLES_IN_PASSAGE:
        # Keep circled numbers as they're passage markers
        # Remove only standalone answer choice lines at the END
        passage = remove_standalone_trailing_choices(cleaned)
    elif q_num in (36, 37):
        # Order questions: keep (A), (B), (C) structure
        passage = remove_standalone_choice_lines(cleaned)
        passage = remove_standalone_trailing_choices(passage)
    elif q_num == 40:
        # Summary: passage + summary with (A), (B) blanks
        passage = remove_standalone_choice_lines(cleaned)
        passage = remove_standalone_trailing_choices(passage)
    elif q_num in (41, 42):
        # 장문 set
        passage = extract_jangmun(cleaned, q_num)
    else:
        # Q20-24, Q31-34: passage with answer choices at end
        passage = remove_standalone_choice_lines(cleaned)
        passage = remove_standalone_trailing_choices(passage)

    # Q31-34: normalize blank markers
    if q_num in (31, 32, 33, 34):
        passage = re.sub(r'_{3,}', '______', passage)
        # Also handle underline-style blanks from PDF rendering
        # Sometimes blanks appear as spaces between text

    # Final cleanup
    passage = re.sub(r'\n{3,}', '\n\n', passage)
    passage = re.sub(r'[ \t]+', ' ', passage)
    passage = passage.strip()

    # Remove lines that are purely spaces/punctuation (no English letters)
    lines = passage.split('\n')
    lines = [l for l in lines if re.search(r'[a-zA-Z①②③④⑤(]', l)]
    passage = '\n'.join(lines).strip()

    # Flatten to single line for cleaner JSON
    passage = re.sub(r'\s*\n\s*', ' ', passage)
    passage = re.sub(r'  +', ' ', passage).strip()

    return passage


def remove_standalone_trailing_choices(text):
    """
    Remove trailing answer choices section.
    These are lines like: "① option A  ② option B"
    or multiple consecutive lines starting with ①②③④⑤.
    """
    lines = text.split('\n')
    # Walk from the end, skip lines that look like answer choices
    end_idx = len(lines)
    for i in range(len(lines) - 1, -1, -1):
        line = lines[i].strip()
        if not line:
            end_idx = i  # trailing empty lines included
            continue
        # Check if this line is an answer choice
        if re.match(r'^[①②③④⑤]\s', line):
            eng = len(re.findall(r'[a-zA-Z]', line))
            total = len(line.replace(' ', ''))
            if total > 0 and eng / total < 0.5:
                end_idx = i
                continue
        break

    return '\n'.join(lines[:end_idx])


def extract_jangmun(text, q_num):
    """For Q41-42 set: extract the long passage."""
    # Remove standalone choice lines throughout
    text = remove_standalone_choice_lines(text)
    text = remove_standalone_trailing_choices(text)
    # For Q42 specifically, passage is same as Q41
    return text


def count_words(text):
    """Count English words."""
    return len(re.findall(r'\b[a-zA-Z]+\b', text))


def process_exam(exam_id):
    """Process a single exam and return passages dict."""
    pdf_path = os.path.join(PDF_DIR, f"{exam_id}\ubb38\uc81c.pdf")

    if not os.path.exists(pdf_path):
        print(f"  WARNING: {pdf_path} not found")
        return {}

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)

    max_pages = 8
    print(f"  {exam_id}\ubb38\uc81c.pdf ({total_pages}pp, using first {max_pages})")

    columns = extract_column_texts(pdf_path, max_pages=max_pages)
    blocks = find_question_blocks(columns, TARGET_QUESTIONS)

    passages = {}
    for q_num in TARGET_QUESTIONS:
        if q_num not in blocks:
            print(f"    Q{q_num}: NOT FOUND")
            passages[str(q_num)] = {"passage": "", "word_count": 0}
            continue

        passage = extract_passage_from_block(blocks[q_num], q_num)
        wc = count_words(passage)

        passages[str(q_num)] = {"passage": passage, "word_count": wc}
        q_type = QUESTION_TYPES.get(q_num, "?")
        status = "OK" if wc > 50 else ("SHORT" if wc > 10 else "EMPTY")
        print(f"    Q{q_num} [{q_type}] {status} ({wc}w): {passage[:90]}")

    return passages


def main():
    all_data = {}

    for exam_id in EXAMS:
        print(f"\n=== {exam_id} ===")
        all_data[exam_id] = process_exam(exam_id)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)

    print(f"\n\nSaved: {OUTPUT_PATH}")

    # Stats
    print("\n=== QUALITY CHECK ===")
    for exam_id in EXAMS:
        exam = all_data[exam_id]
        empty = [q for q, v in exam.items() if v['word_count'] == 0]
        short = [q for q, v in exam.items() if 0 < v['word_count'] < 50]
        ok = [q for q, v in exam.items() if v['word_count'] >= 50]
        print(f"  {exam_id}: OK={len(ok)} SHORT={len(short)} EMPTY={len(empty)}")
        if empty:
            print(f"    Empty: {empty}")
        if short:
            print(f"    Short: {[(q, all_data[exam_id][q]['word_count']) for q in short]}")

    # Show sample passages
    print("\n=== SAMPLE PASSAGES (2306) ===")
    exam = all_data["2306"]
    for q in [20, 21, 22, 29, 31, 33, 35, 37, 38, 41]:
        entry = exam.get(str(q), {})
        print(f"  Q{q} ({entry.get('word_count',0)}w): {entry.get('passage','')[:150]}")
        print()


if __name__ == "__main__":
    main()
