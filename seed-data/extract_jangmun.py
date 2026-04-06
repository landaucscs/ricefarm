import sys
sys.stdout.reconfigure(encoding='utf-8')

import json
import re
import pdfplumber

EXAMS = ['2306', '2309', '2311', '2406', '2409', '2411',
         '2506', '2509', '2511', '2606', '2609', '2611']

CHOICE_SYMBOLS = ['①', '②', '③', '④', '⑤']

def clean_passage(text):
    """Strip trailing choice/question content from passage text."""
    # Remove footnotes like *word: explanation
    text = re.sub(r'\*+[^\n]+', '', text)
    # Remove trailing whitespace
    text = text.strip()
    return text

def count_words(text):
    """Count words in English text (split on whitespace)."""
    # Remove Korean characters and Korean punctuation for word count
    # Keep only English words
    words = text.split()
    return len(words)

def parse_choices(text_after_prompt):
    """
    Parse 5 choices from text starting after the question prompt.
    Choices are marked with ①②③④⑤
    Returns dict {'1': ..., '2': ..., '3': ..., '4': ..., '5': ...}
    """
    choices = {}
    # Find all choice positions
    positions = []
    for i, sym in enumerate(CHOICE_SYMBOLS):
        pos = text_after_prompt.find(sym)
        if pos >= 0:
            positions.append((pos, i + 1, sym))

    positions.sort(key=lambda x: x[0])

    for idx, (pos, num, sym) in enumerate(positions):
        start = pos + len(sym)
        if idx + 1 < len(positions):
            end = positions[idx + 1][0]
        else:
            # End at next question marker or end of section
            end = len(text_after_prompt)
        choice_text = text_after_prompt[start:end].strip()
        # Clean up newlines
        choice_text = ' '.join(choice_text.split())
        choices[str(num)] = choice_text

    return choices

def extract_jangmun_from_pdf(exam_code, pdf_path):
    """Extract Q41 prompt/choices and Q42 prompt/choices from PDF."""
    with pdfplumber.open(pdf_path) as pdf:
        # Page 8 (index 7) contains questions 41-45
        page = pdf.pages[7]

        # Split into left and right columns
        mid_x = page.width / 2
        left_col = page.crop((0, 50, mid_x, page.height))
        left_text = left_col.extract_text() or ''

    # Find the [41~42] section start
    # The left column should have the passage and Q41, Q42

    # Find Q41
    m41 = re.search(r'41\s*[\.．]\s*', left_text)
    if not m41:
        print(f"  WARNING: Could not find Q41 in {exam_code} left column")
        print(f"  Left col snippet: {left_text[:200]}")
        return None, None

    q41_start = m41.start()

    # Find Q42
    m42 = re.search(r'42\s*[\.．]\s*', left_text)
    if not m42:
        print(f"  WARNING: Could not find Q42 in {exam_code} left column")
        return None, None

    q42_start = m42.start()

    # Find [43~45] section to know where Q42 ends
    m43 = re.search(r'\[43', left_text)
    q42_end = m43.start() if m43 else len(left_text)

    # Extract Q41 section text
    q41_text = left_text[q41_start:q42_start]
    q42_text = left_text[q42_start:q42_end]

    # Parse Q41 prompt and choices
    # Prompt is the text before the first ①
    q41_first_choice = q41_text.find('①')
    if q41_first_choice < 0:
        print(f"  WARNING: No choices found for Q41 in {exam_code}")
        return None, None

    q41_prompt_raw = q41_text[:q41_first_choice]
    # Clean prompt: remove "41. " prefix and [3점] etc.
    q41_prompt = re.sub(r'^41\s*[\.．]\s*', '', q41_prompt_raw, flags=re.DOTALL).strip()
    q41_prompt = re.sub(r'\[3점\]', '', q41_prompt).strip()
    q41_prompt = ' '.join(q41_prompt.split())

    q41_choices = parse_choices(q41_text[q41_first_choice:])

    # Parse Q42 prompt and choices
    q42_first_choice = q42_text.find('①')
    if q42_first_choice < 0:
        print(f"  WARNING: No choices found for Q42 in {exam_code}")
        return None, None

    q42_prompt_raw = q42_text[:q42_first_choice]
    # Clean prompt: remove "42. " prefix and [3점] etc.
    q42_prompt = re.sub(r'^42\s*[\.．]\s*', '', q42_prompt_raw, flags=re.DOTALL).strip()
    q42_prompt = re.sub(r'\[3점\]', '', q42_prompt).strip()
    q42_prompt = ' '.join(q42_prompt.split())

    q42_choices = parse_choices(q42_text[q42_first_choice:])

    return {
        'prompt': q41_prompt,
        'choices': q41_choices
    }, {
        'prompt': q42_prompt,
        'choices': q42_choices
    }

def clean_extracted_passage(passage_text):
    """
    Clean passage from extracted_passages.json.
    Strip trailing choice markers and question prompts.
    """
    if not passage_text:
        return passage_text

    # Find where the actual passage ends - before any ① marker or question number pattern
    # that's not part of the passage itself

    # Look for choice markers that indicate we've hit question choices
    # Pattern: standalone ① at start or after newline
    # But (a)~(e) markers in the passage itself use the same symbols, so be careful

    # The choices for Q41 are typically:
    # ① Some English title
    # For Q42 they're: ① (a) ② (b) etc.

    # Strip footnotes
    text = re.sub(r'\*+[a-zA-Z가-힣]+\s*:', '', passage_text)
    text = text.strip()

    return text

def main():
    # Load data
    answers_path = 'C:/Users/JH/Desktop/2026 Reboot/ricemachine/seed-data/answers.json'
    passages_path = 'C:/Users/JH/Desktop/2026 Reboot/ricemachine/seed-data/extracted_passages.json'
    output_path = 'C:/Users/JH/Desktop/2026 Reboot/ricemachine/seed-data/passages/jangmun.jsonl'

    with open(answers_path, 'r', encoding='utf-8') as f:
        answers = json.load(f)

    with open(passages_path, 'r', encoding='utf-8') as f:
        extracted = json.load(f)

    records = []

    for exam_code in EXAMS:
        print(f"\nProcessing {exam_code}...")
        pdf_path = f'C:/Users/JH/Desktop/2026 Reboot/기출/{exam_code}문제.pdf'

        # Get passage from extracted_passages.json
        passage_raw = ''
        if exam_code in extracted and '41' in extracted[exam_code]:
            passage_raw = extracted[exam_code]['41']['passage']

        # Clean passage
        passage = clean_extracted_passage(passage_raw)
        word_count = count_words(passage)

        # Extract Q41 and Q42 from PDF
        q41_data, q42_data = extract_jangmun_from_pdf(exam_code, pdf_path)

        if not q41_data or not q42_data:
            print(f"  ERROR: Could not extract Q41/Q42 for {exam_code}")
            continue

        # Get answers
        exam_answers = answers.get(exam_code, {})
        ans41 = exam_answers.get('41', None)
        ans42 = exam_answers.get('42', None)

        # Build question code (e.g., 2306 -> 230641)
        q41_code = int(exam_code + '41')
        q42_code = int(exam_code + '42')

        record = {
            'exam_code': exam_code,
            'question_type': 'jangmun',
            'passage': passage,
            'word_count': word_count,
            'q41': {
                'question_code': q41_code,
                'question_type_detail': 'title',
                'prompt': q41_data['prompt'],
                'choices': q41_data['choices'],
                'answer': ans41
            },
            'q42': {
                'question_code': q42_code,
                'question_type_detail': 'vocabulary',
                'prompt': q42_data['prompt'],
                'choices': q42_data['choices'],
                'answer': ans42
            }
        }

        records.append(record)

        # Print summary
        print(f"  Passage words: {word_count}")
        print(f"  Q41 prompt: {q41_data['prompt'][:60]}...")
        print(f"  Q41 choices: {list(q41_data['choices'].values())[:2]}...")
        print(f"  Q41 answer: {ans41}")
        print(f"  Q42 prompt: {q42_data['prompt'][:60]}")
        print(f"  Q42 choices: {list(q42_data['choices'].values())}")
        print(f"  Q42 answer: {ans42}")

    # Write JSONL
    with open(output_path, 'w', encoding='utf-8') as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')

    print(f"\n\nWrote {len(records)} records to {output_path}")

if __name__ == '__main__':
    main()
