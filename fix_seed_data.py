"""
Fix two issues in seed data JSONL files:
1. Inaccurate word_count fields
2. Missing blank markers (_____) in Q31-34 passages
"""

import pdfplumber
import json
import os
import re
from collections import defaultdict, Counter

PASSAGES_JSON = "C:/Users/JH/Desktop/2026 Reboot/ricemachine/seed-data/extracted_passages.json"
ANSWERS_JSON = "C:/Users/JH/Desktop/2026 Reboot/ricemachine/seed-data/answers.json"
OUTPUT_DIR = "C:/Users/JH/Desktop/2026 Reboot/ricemachine/seed-data/passages"
PDF_DIR = "C:/Users/JH/Desktop/2026 Reboot/기출"

EXAMS = ['2306', '2309', '2311', '2406', '2409', '2411',
         '2506', '2509', '2511', '2606', '2609', '2611']

QUESTION_TYPE_MAP = {
    20: 'claim', 21: 'implication', 22: 'gist', 23: 'topic', 24: 'title',
    29: 'grammar', 30: 'vocabulary',
    31: 'blank', 32: 'blank', 33: 'blank', 34: 'blank',
    35: 'irrelevant', 36: 'order', 37: 'order',
    38: 'insertion', 39: 'insertion',
    40: 'summary',
    41: 'title', 42: 'vocabulary'
}

TYPE_TO_FILE = {
    'claim': 'claim.jsonl', 'implication': 'implication.jsonl',
    'gist': 'gist.jsonl', 'topic': 'topic.jsonl', 'title': 'title.jsonl',
    'grammar': 'grammar.jsonl', 'vocabulary': 'vocabulary.jsonl',
    'blank': 'blank.jsonl', 'irrelevant': 'irrelevant.jsonl',
    'order': 'order.jsonl', 'insertion': 'insertion.jsonl',
    'summary': 'summary.jsonl'
}

JANGMUN_NOTES = {
    41: "장문 독해 - 제목 (41번)",
    42: "장문 독해 - 어휘 (42번)"
}


def find_blank_line(page, q_top, q_end_top, col_x_min, col_x_max):
    """
    Find blank underline within a question area.
    Handles two formats:
    1. Segmented: many ~5.5px segments (older PDFs)
    2. Single wide line (newer PDFs)
    Returns (blank_top, blank_x0, blank_x1) or None.
    """
    lines = page.lines

    # --- Format 1: Segmented lines ---
    seg_tops = defaultdict(lambda: {'x0': 9999, 'x1': 0, 'count': 0})
    for l in lines:
        if (l['top'] > q_top and l['top'] < q_end_top and
                l['x0'] >= col_x_min - 15 and l['x1'] <= col_x_max + 15 and
                0 < abs(l['x1'] - l['x0']) < 20):
            top_key = round(l['top'], 0)
            seg_tops[top_key]['x0'] = min(seg_tops[top_key]['x0'], l['x0'])
            seg_tops[top_key]['x1'] = max(seg_tops[top_key]['x1'], l['x1'])
            seg_tops[top_key]['count'] += 1

    for top_key, info in seg_tops.items():
        if info['count'] >= 5:
            return (float(top_key), info['x0'], info['x1'])

    # --- Format 2: Single wide line ---
    top_count = Counter(round(l['top'], 0) for l in lines)

    candidates = []
    for l in lines:
        top_key = round(l['top'], 0)
        w = abs(l['x1'] - l['x0'])
        if (l['top'] > q_top and l['top'] < q_end_top and
                l['top'] < 1080 and
                l['x0'] >= col_x_min - 15 and
                l['x1'] <= col_x_max + 15 and
                50 < w < 280 and
                top_count[top_key] == 1):
            candidates.append(l)

    if candidates:
        best = max(candidates, key=lambda x: abs(x['x1'] - x['x0']))
        return (round(best['top'], 0), best['x0'], best['x1'])

    return None


def find_blank_questions_in_pdf(exam_id, pdf):
    """
    Find Q31-34 and their blank positions in the PDF.
    Returns dict: {q_num: (page_idx, blank_top, blank_x0, blank_x1, col_x_min, col_x_max)}
    """
    q_locations = {}

    for page_idx in range(3, min(7, len(pdf.pages))):
        page = pdf.pages[page_idx]
        words = page.extract_words()
        for w in words:
            for qn in [31, 32, 33, 34]:
                if w['text'] == f'{qn}.' and qn not in q_locations:
                    col_xmin = 80 if w['x0'] < 250 else 420
                    col_xmax = 420 if w['x0'] < 250 else 760
                    q_locations[qn] = (page_idx, w['top'], col_xmin, col_xmax)

    print(f"  {exam_id}: Q locations: { {k: f'p{v[0]+1},top={v[1]:.0f}' for k, v in q_locations.items()} }")

    results = {}
    for qn, (page_idx, q_top, col_xmin, col_xmax) in sorted(q_locations.items()):
        q_end_top = 1080
        for next_qn in [32, 33, 34, 35]:
            if next_qn > qn and next_qn in q_locations:
                npage, ntop, _, _ = q_locations[next_qn]
                if npage == page_idx:
                    q_end_top = ntop
                    break

        page = pdf.pages[page_idx]
        blank = find_blank_line(page, q_top, q_end_top, col_xmin, col_xmax)
        if blank:
            results[qn] = (page_idx, blank, col_xmin, col_xmax)
            print(f"    Q{qn}: blank top={blank[0]:.1f}, x={blank[1]:.0f}-{blank[2]:.0f}")
        else:
            print(f"    Q{qn}: NO BLANK FOUND")

    return results


def find_words_around_blank(page, blank_top, blank_x0, blank_x1, col_x_min, col_x_max):
    """
    Find the word immediately before and after the blank underline.

    Strategy:
    - Cluster words into text lines (within 4px of each other).
    - The blank underline sits slightly below (typically 5-15px) the text line it belongs to.
    - Find the text line just above the blank.
    - before_word = last substantive word on that line ending before blank_x0.
    - after_word = first word on the same line starting after blank_x1.
    - If blank spans the whole line width (line-start blank), use prev line for before_word
      and next line for after_word.
    """
    words = page.extract_words()

    def is_passage_word(text):
        if any(0xAC00 <= ord(c) <= 0xD7A3 for c in text):  # Hangul
            return False
        if text.startswith('[') and text.endswith(']'):  # [3점] etc
            return False
        if text.isdigit() and len(text) <= 2:  # page numbers
            return False
        if text.startswith('*'):  # footnote markers
            return False
        return True

    col_words = [
        w for w in words
        if w['x0'] >= col_x_min - 15
        and w['x1'] <= col_x_max + 15
        and is_passage_word(w['text'])
    ]

    # Cluster words into lines (group by top within 4px)
    col_words_sorted = sorted(col_words, key=lambda w: w['top'])
    lines = []  # list of (line_top, [words_sorted_by_x])
    for w in col_words_sorted:
        if lines and abs(w['top'] - lines[-1][0]) < 4:
            lines[-1][1].append(w)
        else:
            lines.append((w['top'], [w]))
    # Sort words within each line by x
    lines = [(top, sorted(wds, key=lambda w: w['x0'])) for top, wds in lines]

    # Find lines above and below blank
    above_lines = [(top, wds) for top, wds in lines if top < blank_top]
    below_lines = [(top, wds) for top, wds in lines if top > blank_top]

    def is_real_word(text):
        return len(text.strip('.,;:!?\'\"()[]{}')) >= 2

    before_word = None
    after_word = None

    if above_lines:
        # Line just above blank
        closest_top, closest_wds = max(above_lines, key=lambda x: x[0])

        # before_word: last word with x1 < blank_x0 - 2
        before_candidates = [w for w in closest_wds if w['x1'] < blank_x0 - 2]
        real_before = [w for w in before_candidates if is_real_word(w['text'])]
        if real_before:
            before_word = real_before[-1]['text']
        elif before_candidates:
            before_word = before_candidates[-1]['text']

        # after_word on same line: first word with x0 > blank_x1 + 2
        after_same = [w for w in closest_wds if w['x0'] > blank_x1 + 2]
        real_after_same = [w for w in after_same if is_real_word(w['text'])]
        if real_after_same:
            after_word = real_after_same[0]['text']
        elif after_same:
            after_word = after_same[0]['text']

    # If no before_word yet (blank fills start of line), look at lines further above
    if before_word is None and len(above_lines) >= 2:
        prev_lines_sorted = sorted(above_lines, key=lambda x: x[0], reverse=True)
        for prev_top, prev_wds in prev_lines_sorted[1:4]:  # try up to 3 lines above
            real_words = [w for w in prev_wds if is_real_word(w['text'])]
            if real_words:
                before_word = real_words[-1]['text']
                break

    # If no after_word yet, use first word of line just below blank
    if after_word is None and below_lines:
        next_top, next_wds = min(below_lines, key=lambda x: x[0])
        real_next = [w for w in next_wds if is_real_word(w['text'])]
        if real_next:
            after_word = real_next[0]['text']

    return before_word, after_word


def find_words_context(page, blank_top, blank_x0, blank_x1, col_x_min, col_x_max, n=4):
    """
    Get multiple words of context before and after the blank.
    Returns (before_words_list, after_words_list).
    """
    words = page.extract_words()

    def is_passage_word_inner(text):
        if any(0xAC00 <= ord(c) <= 0xD7A3 for c in text):
            return False
        if text.startswith('[') and text.endswith(']'):
            return False
        if text.isdigit() and len(text) <= 2:
            return False
        if text.startswith('*'):
            return False
        return True

    col_words = [
        w for w in words
        if w['x0'] >= col_x_min - 15
        and w['x1'] <= col_x_max + 15
        and is_passage_word_inner(w['text'])
    ]

    col_words_sorted = sorted(col_words, key=lambda w: w['top'])
    lines = []
    for w in col_words_sorted:
        if lines and abs(w['top'] - lines[-1][0]) < 4:
            lines[-1][1].append(w)
        else:
            lines.append((w['top'], [w]))
    lines = [(top, sorted(wds, key=lambda w: w['x0'])) for top, wds in lines]

    above_lines = sorted([(top, wds) for top, wds in lines if top < blank_top], key=lambda x: x[0])
    below_lines = sorted([(top, wds) for top, wds in lines if top > blank_top], key=lambda x: x[0])

    def is_real_word(text):
        return len(text.strip('.,;:!?\'\"()[]{}')) >= 2

    before_list = []
    after_list = []

    if above_lines:
        closest_top, closest_wds = above_lines[-1]
        before_on_line = [w['text'] for w in closest_wds if w['x1'] < blank_x0 - 2]
        after_on_line = [w['text'] for w in closest_wds if w['x0'] > blank_x1 + 2]
        before_list = before_on_line[-n:]
        after_list = after_on_line[:n]

    # Get more before context from prev lines if needed
    # Include ALL words (even short ones like 'a', 'I') for better context matching
    if len(before_list) < 2:
        for prev_top, prev_wds in reversed(above_lines[:-1] if above_lines else []):
            if len(before_list) >= n:
                break
            prev_texts = [w['text'] for w in prev_wds]  # include all words
            before_list = prev_texts[-n:] + before_list

    # Get more after context from next lines if needed
    if len(after_list) < 2 and below_lines:
        next_top, next_wds = below_lines[0]
        next_texts = [w['text'] for w in next_wds if is_real_word(w['text'])]
        after_list = after_list + next_texts[:n]

    return before_list, after_list


def insert_blank_with_context(passage, before_words, after_words):
    """
    Insert _____ into passage using multi-word context.
    Tries progressively shorter context until a unique match is found.
    Returns (new_passage, success).
    """
    if not before_words and not after_words:
        return passage, False

    # Try combined patterns from longest to shortest
    for b_len in range(min(len(before_words), 4), 0, -1):
        for a_len in range(min(len(after_words), 4), 0, -1):
            b_ctx = before_words[-b_len:]
            a_ctx = after_words[:a_len]

            # Build regex pattern
            b_pattern = r'\s+'.join(re.escape(w) for w in b_ctx)
            a_pattern = r'\s+'.join(re.escape(w) for w in a_ctx)
            full_pattern = b_pattern + r'\s+' + a_pattern

            matches = list(re.finditer(full_pattern, passage))
            if len(matches) == 1:
                # Unique match - insert after the before context
                m = matches[0]
                # Find end of b_ctx within match
                b_match_len = sum(len(w) for w in b_ctx) + len(b_ctx) - 1
                # More precise: find where b_ctx ends in the match
                b_end_in_passage = m.start() + len(re.match(b_pattern, passage[m.start():]).group(0))
                new_passage = passage[:b_end_in_passage] + ' _____' + passage[b_end_in_passage:]
                return new_passage, True

    # Try just before context (last few words)
    for b_len in range(min(len(before_words), 4), 0, -1):
        b_ctx = before_words[-b_len:]
        b_pattern = r'\s+'.join(re.escape(w) for w in b_ctx)
        matches = list(re.finditer(b_pattern, passage))
        if len(matches) == 1:
            m = matches[0]
            b_end = m.end()
            new_passage = passage[:b_end] + ' _____' + passage[b_end:]
            return new_passage, True

    # Try just after context (first few words)
    for a_len in range(min(len(after_words), 4), 0, -1):
        a_ctx = after_words[:a_len]
        a_pattern = r'\s+'.join(re.escape(w) for w in a_ctx)
        matches = list(re.finditer(a_pattern, passage))
        if len(matches) == 1:
            m = matches[0]
            # Insert before the match
            new_passage = passage[:m.start()] + '_____ ' + passage[m.start():]
            return new_passage, True

    return passage, False


def process_blank_for_question(exam_id, q_num, pdf, blank_q_info, passages_data):
    """Process one blank question and return fixed passage."""
    q_key = str(q_num)
    if exam_id not in passages_data or q_key not in passages_data[exam_id]:
        print(f"    WARNING: {exam_id} Q{q_num} not in passages data")
        return None

    orig_passage = passages_data[exam_id][q_key]['passage']

    if '_____' in orig_passage:
        print(f"    Q{q_num}: already has blank marker")
        return orig_passage

    if q_num not in blank_q_info:
        print(f"    Q{q_num}: no blank info found")
        return orig_passage

    page_idx, blank, col_xmin, col_xmax = blank_q_info[q_num]
    blank_top, blank_x0, blank_x1 = blank
    page = pdf.pages[page_idx]

    before_words, after_words = find_words_context(
        page, blank_top, blank_x0, blank_x1, col_xmin, col_xmax
    )
    print(f"    Q{q_num}: before_ctx={before_words}, after_ctx={after_words}")

    new_passage, success = insert_blank_with_context(orig_passage, before_words, after_words)
    if success:
        print(f"    Q{q_num}: SUCCESS")
    else:
        print(f"    Q{q_num}: FAILED to insert blank")

    return new_passage


def main():
    with open(PASSAGES_JSON, 'r', encoding='utf-8') as f:
        passages_data = json.load(f)
    with open(ANSWERS_JSON, 'r', encoding='utf-8') as f:
        answers_data = json.load(f)

    print("=== Pass 1: Fix blank passages in Q31-34 ===\n")
    blank_fixes = {}  # (exam_id, q_num) -> new_passage

    for exam_id in EXAMS:
        pdf_path = f"{PDF_DIR}/{exam_id}문제.pdf"
        if not os.path.exists(pdf_path):
            print(f"WARNING: PDF not found: {pdf_path}")
            continue

        print(f"\nProcessing {exam_id}...")
        try:
            with pdfplumber.open(pdf_path) as pdf:
                blank_q_info = find_blank_questions_in_pdf(exam_id, pdf)

                for q_num in [31, 32, 33, 34]:
                    new_passage = process_blank_for_question(
                        exam_id, q_num, pdf, blank_q_info, passages_data
                    )
                    if new_passage is not None:
                        blank_fixes[(exam_id, q_num)] = new_passage

        except Exception as e:
            print(f"  ERROR processing {exam_id}: {e}")
            import traceback
            traceback.print_exc()

    print("\n=== Pass 2: Build all records and write JSONL files ===\n")

    type_records = defaultdict(list)

    for exam_id in EXAMS:
        if exam_id not in passages_data:
            print(f"WARNING: {exam_id} not in passages data")
            continue

        exam_answers = answers_data.get(exam_id, {})
        exam_passages = passages_data[exam_id]

        for q_key, q_data in exam_passages.items():
            try:
                q_num = int(q_key)
            except ValueError:
                continue

            if q_num not in QUESTION_TYPE_MAP:
                continue

            q_type = QUESTION_TYPE_MAP[q_num]
            passage = q_data['passage'] if isinstance(q_data, dict) else str(q_data)

            if q_type == 'blank':
                passage = blank_fixes.get((exam_id, q_num), passage)

            answer = exam_answers.get(str(q_num))
            if answer is None:
                answer = exam_answers.get(q_num)
            if answer is None:
                print(f"WARNING: No answer for {exam_id} Q{q_num}")
                answer = 0

            question_code = int(f"{exam_id}{q_num:02d}")
            word_count = len(passage.split())

            record = {
                "question_code": question_code,
                "question_number": q_num,
                "question_type": q_type,
                "passage": passage,
                "word_count": word_count,
                "answer": answer
            }

            if q_num in [41, 42]:
                record["jangmun_set"] = True
                record["jangmun_note"] = JANGMUN_NOTES[q_num]

            type_records[q_type].append(record)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for q_type, file_name in TYPE_TO_FILE.items():
        records = type_records.get(q_type, [])
        records.sort(key=lambda x: x['question_code'])

        out_path = os.path.join(OUTPUT_DIR, file_name)
        with open(out_path, 'w', encoding='utf-8') as f:
            for rec in records:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')

        print(f"  {file_name}: {len(records)} records")

    print("\n=== Verification ===\n")

    blank_path = os.path.join(OUTPUT_DIR, 'blank.jsonl')
    with open(blank_path, 'r', encoding='utf-8') as f:
        blank_records = [json.loads(line) for line in f if line.strip()]

    missing_blank = [r for r in blank_records if '_____' not in r['passage']]
    has_blank = [r for r in blank_records if '_____' in r['passage']]

    print(f"Blank records total: {len(blank_records)}")
    print(f"  Has '_____': {len(has_blank)}")
    print(f"  Missing '_____': {len(missing_blank)}")

    if missing_blank:
        print("\nStill missing blank marker:")
        for r in missing_blank:
            print(f"  {r['question_code']}: {r['passage'][:100]}...")

    print("\nChecking word counts across all files...")
    wc_errors = 0
    for file_name in TYPE_TO_FILE.values():
        out_path = os.path.join(OUTPUT_DIR, file_name)
        if not os.path.exists(out_path):
            continue
        with open(out_path, 'r', encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                rec = json.loads(line)
                actual_wc = len(rec['passage'].split())
                if actual_wc != rec['word_count']:
                    print(f"  WC MISMATCH {rec['question_code']}: stored={rec['word_count']}, actual={actual_wc}")
                    wc_errors += 1

    if wc_errors == 0:
        print("  All word counts are accurate!")
    else:
        print(f"  {wc_errors} word count errors found!")

    print("\n=== Sample blank passages ===\n")
    for r in has_blank[:5]:
        print(f"Q{r['question_code']} (wc={r['word_count']}, ans={r['answer']}):")
        idx = r['passage'].find('_____')
        start = max(0, idx - 70)
        end = min(len(r['passage']), idx + 75)
        print(f"  ...{r['passage'][start:end]}...")
        print()


if __name__ == '__main__':
    main()
