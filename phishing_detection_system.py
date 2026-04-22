import re
import tkinter as tk
from tkinter import messagebox, ttk
from urllib.parse import urlparse


# This tool is for educational purposes only and does not guarantee
# 100% accurate phishing detection.

APP_TITLE = "Phishing Detection System"
URL_LENGTH_THRESHOLD = 75
SUSPICIOUS_KEYWORDS = [
    "urgent",
    "free",
    "click",
    "win",
    "verify",
    "password",
    "bank",
]

# Sample blacklist for demonstration purposes.
BLACKLISTED_DOMAINS = {
    "bank-alert.example",
    "secure-update.example",
    "paypa1-login.example",
}

KNOWN_BRANDS = {
    "paypal",
    "google",
    "apple",
    "amazon",
    "microsoft",
    "facebook",
    "instagram",
    "netflix",
    "chase",
    "bankofamerica",
}

SUBSTITUTION_MAP = str.maketrans(
    {
        "0": "o",
        "1": "l",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "$": "s",
        "!": "i",
    }
)


def extract_url_candidates(text):
    """Return URL-like strings found inside the user's text."""
    raw_urls = re.findall(r"(?:https?://|www\.)[^\s]+", text, flags=re.IGNORECASE)
    urls = [url.rstrip(".,;:!?)]}\"'") for url in raw_urls]

    # If the full input looks like a URL without a scheme, treat it like one.
    compact_text = text.strip()
    if not urls and " " not in compact_text and "." in compact_text:
        urls.append(compact_text.rstrip(".,;:!?)]}\"'"))

    return urls


def clean_domain(url):
    """Extract a clean domain name from a URL-like string."""
    parsed_url = urlparse(url if "://" in url else f"http://{url}")
    domain = parsed_url.netloc.lower()

    if not domain:
        return ""

    domain = domain.split("@")[-1]
    domain = domain.split(":")[0]

    if domain.startswith("www."):
        domain = domain[4:]

    return domain


def find_keywords(text):
    """Find suspicious keywords inside the text."""
    found_keywords = []
    lowered_text = text.lower()

    for keyword in SUSPICIOUS_KEYWORDS:
        pattern = rf"\b{re.escape(keyword)}\b"
        if re.search(pattern, lowered_text):
            found_keywords.append(keyword)

    return found_keywords


def find_lookalike_tokens(text):
    """Detect words that may imitate trusted websites or brands."""
    suspicious_tokens = []
    seen_tokens = set()
    parts = re.findall(r"[a-zA-Z0-9@$.!_-]{5,}", text.lower())

    for part in parts:
        cleaned_part = part.strip(".,;:!?()[]{}<>\"'")
        if not cleaned_part or cleaned_part in seen_tokens:
            continue

        normalized_part = cleaned_part.translate(SUBSTITUTION_MAP)
        has_mixed_letters = any(char.isalpha() for char in cleaned_part)
        has_substitution_char = any(char in "013457@$!" for char in cleaned_part)

        if (
            has_mixed_letters
            and has_substitution_char
            and normalized_part != cleaned_part
            and any(brand in normalized_part for brand in KNOWN_BRANDS)
        ):
            suspicious_tokens.append(cleaned_part)
            seen_tokens.add(cleaned_part)

    return suspicious_tokens


def analyze_input(text):
    """Analyze text using simple rule-based phishing checks."""
    issues = []
    highlight_terms = []
    raw_score = 0

    lowered_text = text.lower()
    urls = extract_url_candidates(text)

    if "http://" in lowered_text:
        issues.append("Uses 'http://' instead of the safer 'https://'.")
        highlight_terms.append("http://")
        raw_score += 2

    keyword_matches = find_keywords(text)
    for keyword in keyword_matches:
        issues.append(f"Contains suspicious keyword: '{keyword}'.")
        highlight_terms.append(keyword)
    raw_score += len(keyword_matches)

    long_urls = [url for url in urls if len(url) > URL_LENGTH_THRESHOLD]
    for url in long_urls:
        issues.append(
            f"Contains an unusually long URL ({len(url)} characters): {url}"
        )
        highlight_terms.append(url)
    if long_urls:
        raw_score += 1

    blacklisted_domains = []
    for url in urls:
        domain = clean_domain(url)
        if domain in BLACKLISTED_DOMAINS and domain not in blacklisted_domains:
            blacklisted_domains.append(domain)

    for domain in blacklisted_domains:
        issues.append(f"Matches a blacklisted domain: '{domain}'.")
        highlight_terms.append(domain)
    if blacklisted_domains:
        raw_score += 3

    lookalike_tokens = find_lookalike_tokens(text)
    for token in lookalike_tokens:
        issues.append(f"Contains a possible look-alike word or website name: '{token}'.")
        highlight_terms.append(token)
    if lookalike_tokens:
        raw_score += 2

    risk_score = min(raw_score, 5)

    if risk_score == 0:
        category = "Safe"
    elif risk_score <= 2:
        category = "Suspicious"
    else:
        category = "High Risk"

    return {
        "category": category,
        "score": risk_score,
        "issues": issues,
        "highlight_terms": sorted(set(highlight_terms), key=str.lower),
    }


def clear_highlights():
    """Remove old highlight tags from the input text box."""
    input_text.tag_remove("highlight", "1.0", tk.END)


def highlight_terms_in_input(terms):
    """Highlight suspicious text inside the input box."""
    clear_highlights()

    for term in terms:
        start_index = "1.0"
        while True:
            match_index = input_text.search(
                term, start_index, stopindex=tk.END, nocase=True
            )
            if not match_index:
                break

            end_index = f"{match_index}+{len(term)}c"
            input_text.tag_add("highlight", match_index, end_index)
            start_index = end_index


def update_issues_box(issues, default_message=None):
    """Show each detected issue in the output area."""
    issues_box.config(state="normal")
    issues_box.delete("1.0", tk.END)

    if issues:
        for issue in issues:
            issues_box.insert(tk.END, f"- {issue}\n")
    else:
        issues_box.insert(
            tk.END,
            default_message
            or "No suspicious indicators were found by the current rule-based checks.",
        )

    issues_box.config(state="disabled")


def check_input():
    """Run the phishing analysis and update the GUI."""
    user_text = input_text.get("1.0", tk.END).strip()

    if not user_text:
        messagebox.showwarning("Missing Input", "Please enter a URL or message first.")
        return

    result = analyze_input(user_text)
    category = result["category"]

    color_map = {
        "Safe": "#1b5e20",
        "Suspicious": "#b26a00",
        "High Risk": "#b00020",
    }

    result_var.set(f"Result: {category}")
    score_var.set(f"Risk Score: {result['score']} / 5")
    result_label.config(fg=color_map[category])
    score_label.config(fg=color_map[category])

    update_issues_box(result["issues"])
    highlight_terms_in_input(result["highlight_terms"])


def clear_form():
    """Reset the input, output, and highlighting."""
    input_text.delete("1.0", tk.END)
    clear_highlights()
    result_var.set("Result: Waiting for input")
    score_var.set("Risk Score: 0 / 5")
    result_label.config(fg="#1f2937")
    score_label.config(fg="#1f2937")
    update_issues_box([], "Detected issues will appear here after a check.")
    input_text.focus_set()


def build_gui():
    """Create and start the Tkinter window."""
    global input_text, result_label, score_label, issues_box, result_var, score_var

    root = tk.Tk()
    root.title(APP_TITLE)
    root.geometry("840x620")
    root.minsize(760, 560)

    style = ttk.Style()
    if "clam" in style.theme_names():
        style.theme_use("clam")

    style.configure("Main.TFrame", background="#f4f6f8")
    style.configure("Card.TFrame", background="#ffffff")
    style.configure(
        "Title.TLabel",
        background="#f4f6f8",
        foreground="#102a43",
        font=("Helvetica", 18, "bold"),
    )
    style.configure(
        "Body.TLabel",
        background="#f4f6f8",
        foreground="#334e68",
        font=("Helvetica", 10),
    )
    style.configure(
        "Section.TLabel",
        background="#ffffff",
        foreground="#102a43",
        font=("Helvetica", 11, "bold"),
    )

    root.configure(bg="#f4f6f8")

    main_frame = ttk.Frame(root, padding=20, style="Main.TFrame")
    main_frame.pack(fill="both", expand=True)

    ttk.Label(main_frame, text=APP_TITLE, style="Title.TLabel").pack(anchor="w")
    ttk.Label(
        main_frame,
        text="Enter a URL, email, or message to check for simple phishing signs.",
        style="Body.TLabel",
    ).pack(anchor="w", pady=(4, 16))

    card_frame = ttk.Frame(main_frame, padding=18, style="Card.TFrame")
    card_frame.pack(fill="both", expand=True)

    ttk.Label(card_frame, text="Input", style="Section.TLabel").pack(anchor="w")

    input_text = tk.Text(
        card_frame,
        height=10,
        wrap="word",
        font=("Helvetica", 11),
        relief="solid",
        bd=1,
        padx=10,
        pady=10,
    )
    input_text.pack(fill="x", pady=(8, 14))
    input_text.tag_configure("highlight", background="#fff3bf")

    button_frame = ttk.Frame(card_frame, style="Card.TFrame")
    button_frame.pack(fill="x", pady=(0, 16))

    ttk.Button(button_frame, text="Check", command=check_input).pack(
        side="left", padx=(0, 10)
    )
    ttk.Button(button_frame, text="Clear", command=clear_form).pack(side="left")

    result_var = tk.StringVar(value="Result: Waiting for input")
    score_var = tk.StringVar(value="Risk Score: 0 / 5")

    result_label = tk.Label(
        card_frame,
        textvariable=result_var,
        bg="#ffffff",
        fg="#1f2937",
        font=("Helvetica", 11, "bold"),
    )
    result_label.pack(anchor="w")

    score_label = tk.Label(
        card_frame,
        textvariable=score_var,
        bg="#ffffff",
        fg="#1f2937",
        font=("Helvetica", 10),
    )
    score_label.pack(anchor="w", pady=(4, 14))

    ttk.Label(card_frame, text="Detected Issues", style="Section.TLabel").pack(
        anchor="w"
    )

    issues_box = tk.Text(
        card_frame,
        height=10,
        wrap="word",
        font=("Helvetica", 10),
        relief="solid",
        bd=1,
        padx=10,
        pady=10,
        state="disabled",
    )
    issues_box.pack(fill="both", expand=True, pady=(8, 10))

    ttk.Label(
        card_frame,
        text=(
            "Educational note: this tool uses simple rules and should not be used "
            "as the only method for deciding whether a message is safe."
        ),
        style="Body.TLabel",
        wraplength=760,
    ).pack(anchor="w")

    clear_form()
    root.mainloop()


if __name__ == "__main__":
    build_gui()
