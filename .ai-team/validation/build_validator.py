"""
Build Integrity & Syntax Validator.
Checks JavaScript, CSS, HTML, and Python syntax balance.
"""

import os
import re
from typing import Dict, Any, List, Optional, Tuple


class BuildValidator:
    """Fast local syntax and build sanity validator."""

    def __init__(self, root_dir: Optional[str] = None):
        self.root_dir = os.path.abspath(root_dir or os.getcwd())

    def validate_file(self, filepath: str) -> Tuple[bool, str]:
        """Validates a single file based on its extension."""
        if not os.path.exists(filepath):
            return False, f"File not found: {filepath}"

        ext = os.path.splitext(filepath)[1].lower()
        if ext == ".js":
            return self.validate_js(filepath)
        elif ext == ".css":
            return self.validate_css(filepath)
        elif ext == ".html":
            return self.validate_html(filepath)
        elif ext == ".py":
            return self.validate_python(filepath)
        return True, "File type skipped (no syntax rules defined)"

    def validate_js(self, filepath: str) -> Tuple[bool, str]:
        """Checks for bracket and brace balance in JavaScript."""
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            stack = []
            pairs = {')': '(', ']': '[', '}': '{'}
            in_str = False
            str_char = ''
            in_regex = False
            in_regex_class = False
            i = 0
            n = len(content)
            prev_token = None

            while i < n:
                ch = content[i]

                if in_str:
                    if ch == '\\':
                        i += 1
                    elif ch == str_char:
                        in_str = False
                        prev_token = 'str'
                elif in_regex:
                    if ch == '\\':
                        i += 1
                    elif in_regex_class:
                        if ch == ']':
                            in_regex_class = False
                    else:
                        if ch == '[':
                            in_regex_class = True
                        elif ch == '/':
                            in_regex = False
                            prev_token = 'regex'
                else:
                    if ch == '/' and i + 1 < n and content[i + 1] == '/':
                        end = content.find('\n', i)
                        i = n if end == -1 else end
                        continue
                    elif ch == '/' and i + 1 < n and content[i + 1] == '*':
                        end = content.find('*/', i + 2)
                        if end == -1:
                            return False, f"Unclosed block comment /* in {os.path.basename(filepath)}"
                        i = end + 2
                        continue
                    elif ch in ('"', "'", '`'):
                        in_str = True
                        str_char = ch
                    elif ch == '/':
                        if prev_token in (None, '(', '[', '{', ',', ';', ':', '=', '!', '&', '|', '?', 'return', 'case', 'typeof'):
                            in_regex = True
                            in_regex_class = False
                        else:
                            prev_token = '/'
                    elif ch in '([{':
                        stack.append(ch)
                        prev_token = ch
                    elif ch in ')]}':
                        if not stack or stack.pop() != pairs[ch]:
                            line_no = content[:i].count('\n') + 1
                            return False, f"Unmatched '{ch}' in {os.path.basename(filepath)} at line {line_no}"
                        prev_token = ch
                    elif not ch.isspace():
                        if ch.isalnum() or ch in ('_', '$'):
                            start_id = i
                            while i + 1 < n and (content[i + 1].isalnum() or content[i + 1] in ('_', '$')):
                                i += 1
                            ident = content[start_id:i+1]
                            prev_token = ident
                        else:
                            prev_token = ch
                i += 1

            if stack:
                return False, f"Unclosed brackets in {os.path.basename(filepath)}: {len(stack)}"
            return True, "JavaScript syntax balanced"
        except Exception as e:
            return False, str(e)

    def validate_css(self, filepath: str) -> Tuple[bool, str]:
        """Checks for balanced braces in CSS."""
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            open_b = content.count("{")
            close_b = content.count("}")
            if open_b != close_b:
                return False, f"Mismatched braces in CSS: {open_b} open vs {close_b} close"
            return True, "CSS braces balanced"
        except Exception as e:
            return False, str(e)

    def validate_html(self, filepath: str) -> Tuple[bool, str]:
        """Checks basic HTML tag balance."""
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            div_opens = len(re.findall(r"<div[\s>]", content))
            div_closes = content.count("</div>")
            if div_opens != div_closes:
                return False, f"Mismatched <div> tags: {div_opens} opens vs {div_closes} closes"
            return True, "HTML basic structure valid"
        except Exception as e:
            return False, str(e)

    def validate_python(self, filepath: str) -> Tuple[bool, str]:
        """Compiles Python file to check for syntax errors."""
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                source = f.read()
            compile(source, filepath, "exec")
            return True, "Python syntax clean"
        except SyntaxError as e:
            return False, f"SyntaxError at line {e.lineno}: {e.msg}"
        except Exception as e:
            return False, str(e)
