"""
Secure Lock System with Attack Simulation

This program is for educational purposes only.
Do not use it on real systems or attempt access without permission.
"""

import hashlib
import itertools
import math
import queue
import string
import threading
import time
import tkinter as tk
from tkinter import ttk
from tkinter import messagebox


class SecureLockSystemApp:
    """Simple Tkinter app that demonstrates password hashing and lockouts."""

    MAX_ATTEMPTS = 3
    LOCK_SECONDS = 10
    MIN_WINDOW_WIDTH = 640
    MIN_WINDOW_HEIGHT = 560
    LIVE_ATTACK_LIMIT = 5_000_000
    BENCHMARK_ATTEMPTS = 5000
    PROGRESS_UPDATE_SECONDS = 0.5
    DEMO_PASSWORD = "ab1"
    LOWERCASE_CHARSET = string.ascii_lowercase
    UPPERCASE_CHARSET = string.ascii_uppercase
    DIGIT_CHARSET = string.digits
    SYMBOL_CHARSET = string.punctuation
    SPACE_CHARSET = " "
    DEMO_CHARSET = string.ascii_lowercase + string.digits
    ATTACK_CATEGORIES = (
        ("lowercase letter", "lowercase letters", string.ascii_lowercase),
        ("uppercase letter", "uppercase letters", string.ascii_uppercase),
        ("number", "numbers", string.digits),
        ("symbol", "symbols", string.punctuation),
        ("space", "spaces", " "),
    )
    SUPPORTED_CHARSET = (
        string.ascii_lowercase + string.ascii_uppercase + string.digits + string.punctuation + " "
    )

    def __init__(self, root):
        self.root = root
        self.root.title("Secure Lock System with Attack Simulation")
        self.root.resizable(True, True)

        # Store only the password hash, never the plain text password.
        self.password_hash = None
        self.password_length = 0
        self.password_attack_profile = None
        self.failed_attempts = 0
        self.locked = False
        self.lock_seconds_remaining = 0
        self.force_attack_var = tk.BooleanVar(value=False)
        self.attack_result_queue = queue.Queue()
        self.attack_running = False

        self.build_gui()
        self.fit_window_to_content()

    def build_gui(self):
        """Create all labels, entries, and buttons."""
        outer_frame = ttk.Frame(self.root)
        outer_frame.pack(fill="both", expand=True)

        self.main_canvas = tk.Canvas(outer_frame, highlightthickness=0)
        self.main_canvas.pack(side="left", fill="both", expand=True)

        self.main_scrollbar = ttk.Scrollbar(outer_frame, orient="vertical", command=self.main_canvas.yview)
        self.main_scrollbar.pack(side="right", fill="y")

        self.main_canvas.configure(yscrollcommand=self.main_scrollbar.set)

        main_frame = ttk.Frame(self.main_canvas, padding=20)
        self.main_canvas_window = self.main_canvas.create_window((0, 0), window=main_frame, anchor="nw")
        main_frame.bind("<Configure>", self.update_scroll_region)
        self.main_canvas.bind("<Configure>", self.resize_canvas_window)
        self.main_canvas.bind_all("<MouseWheel>", self.on_mousewheel)

        title_label = ttk.Label(
            main_frame,
            text="Secure Lock System with Attack Simulation",
            font=("Arial", 16, "bold"),
        )
        title_label.pack(pady=(0, 15))

        info_label = ttk.Label(
            main_frame,
            text="Educational demo: passwords are hashed with SHA-256, and the attack section is a safe simulation only.",
            wraplength=500,
            justify="center",
        )
        info_label.pack(pady=(0, 20))

        setup_frame = ttk.LabelFrame(main_frame, text="1. Password Setup", padding=15)
        setup_frame.pack(fill="x", pady=(0, 15))

        ttk.Label(setup_frame, text="Create a password or PIN:").grid(row=0, column=0, sticky="w")
        self.setup_entry = ttk.Entry(setup_frame, width=30, show="*")
        self.setup_entry.grid(row=1, column=0, padx=(0, 10), pady=8, sticky="w")

        self.set_button = ttk.Button(setup_frame, text="Set Password", command=self.set_password)
        self.set_button.grid(row=1, column=1, pady=8, sticky="w")

        self.setup_message = ttk.Label(setup_frame, text="No password has been set yet.", foreground="blue")
        self.setup_message.grid(row=2, column=0, columnspan=2, sticky="w")

        login_frame = ttk.LabelFrame(main_frame, text="2. Login System", padding=15)
        login_frame.pack(fill="x", pady=(0, 15))

        ttk.Label(login_frame, text="Enter password:").grid(row=0, column=0, sticky="w")
        self.login_entry = ttk.Entry(login_frame, width=30, show="*")
        self.login_entry.grid(row=1, column=0, padx=(0, 10), pady=8, sticky="w")

        self.login_button = ttk.Button(login_frame, text="Login", command=self.login)
        self.login_button.grid(row=1, column=1, pady=8, sticky="w")

        self.attempts_label = ttk.Label(
            login_frame,
            text=f"Attempts remaining: {self.MAX_ATTEMPTS}",
        )
        self.attempts_label.grid(row=2, column=0, columnspan=2, sticky="w")

        self.login_message = ttk.Label(login_frame, text="Waiting for login.", foreground="black")
        self.login_message.grid(row=3, column=0, columnspan=2, sticky="w", pady=(6, 0))

        self.lock_message = ttk.Label(login_frame, text="", foreground="red")
        self.lock_message.grid(row=4, column=0, columnspan=2, sticky="w", pady=(6, 0))

        attack_frame = ttk.LabelFrame(
            main_frame,
            text="3. Brute Force Attack Simulation",
            padding=15,
        )
        attack_frame.pack(fill="x", pady=(0, 15))

        self.attack_button = ttk.Button(
            attack_frame,
            text="Run Attack Simulation",
            command=self.run_attack_simulation,
        )
        self.attack_button.pack(anchor="w", pady=(0, 12))

        self.force_attack_check = ttk.Checkbutton(
            attack_frame,
            text="Force Live Crack for Large Passwords",
            variable=self.force_attack_var,
            command=self.update_attack_target_label,
        )
        self.force_attack_check.pack(anchor="w", pady=(0, 12))

        attack_note = ttk.Label(
            attack_frame,
            text=(
                "Safe simulation for educational purposes only.\n"
                "This demo now uses exact pattern counts, such as 2 lowercase letters and 2 numbers.\n"
                "If the search space is small enough, it will crack the hashed password live.\n"
                "If the search space is too large, it will estimate by default unless you force a live crack."
            ),
            wraplength=500,
            justify="left",
        )
        attack_note.pack(anchor="w")

        self.attack_target_label = ttk.Label(
            attack_frame,
            text="Current attack target: demo password 'ab1'.",
            wraplength=540,
            justify="left",
            foreground="blue",
        )
        self.attack_target_label.pack(anchor="w", pady=(12, 0))

        self.attack_result = ttk.Label(
            attack_frame,
            text="Simulation not started yet.",
            justify="left",
            wraplength=540,
        )
        self.attack_result.pack(anchor="w", pady=(12, 0))

    def fit_window_to_content(self):
        """Size the window reasonably while the canvas handles overflow."""
        self.root.update_idletasks()
        required_width = max(self.MIN_WINDOW_WIDTH, self.root.winfo_reqwidth())
        required_height = max(self.MIN_WINDOW_HEIGHT, self.root.winfo_reqheight())
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        max_width = int(screen_width * 0.9)
        max_height = int(screen_height * 0.85)
        window_width = min(required_width, max_width)
        window_height = min(required_height, max_height)
        self.root.minsize(self.MIN_WINDOW_WIDTH, self.MIN_WINDOW_HEIGHT)
        self.root.geometry(f"{window_width}x{window_height}")

    def update_scroll_region(self, _event=None):
        """Keep the canvas scroll area in sync with the content height."""
        self.main_canvas.configure(scrollregion=self.main_canvas.bbox("all"))

    def resize_canvas_window(self, event):
        """Stretch the embedded content frame to match the canvas width."""
        self.main_canvas.itemconfigure(self.main_canvas_window, width=event.width)

    def on_mousewheel(self, event):
        """Allow scrolling the window with the mouse wheel."""
        if event.delta == 0:
            return

        direction = -1 if event.delta > 0 else 1
        self.main_canvas.yview_scroll(direction, "units")

    def scroll_to_bottom(self):
        """Move the canvas so the newest attack status is visible."""
        self.root.update_idletasks()
        self.update_scroll_region()
        self.main_canvas.yview_moveto(1.0)

    # Hashing helper used for both password setup and login comparison.
    def hash_password(self, password):
        return hashlib.sha256(password.encode("utf-8")).hexdigest()

    def set_password(self):
        """Hash and store a new password entered by the user."""
        password = self.setup_entry.get()

        if password == "":
            self.setup_message.config(text="Please enter a password or PIN first.", foreground="red")
            return

        self.password_hash = self.hash_password(password)
        self.password_length = len(password)
        self.password_attack_profile = self.build_attack_profile(password)
        self.failed_attempts = 0
        self.update_attempts_label()
        self.setup_message.config(
            text="Password saved securely using SHA-256 hashing.",
            foreground="green",
        )
        self.login_message.config(text="Password is ready. You can now log in.", foreground="black")
        self.update_attack_target_label()
        self.setup_entry.delete(0, tk.END)

    def login(self):
        """Check the entered password and handle lockout rules."""
        if self.password_hash is None:
            self.login_message.config(text="Set a password before trying to log in.", foreground="red")
            return

        if self.locked:
            self.login_message.config(
                text="System is locked. Please wait for the countdown to finish.",
                foreground="red",
            )
            return

        entered_password = self.login_entry.get()
        entered_hash = self.hash_password(entered_password)

        if entered_hash == self.password_hash:
            self.failed_attempts = 0
            self.update_attempts_label()
            self.login_message.config(text="Access Granted", foreground="green")
            self.lock_message.config(text="")
        else:
            self.failed_attempts += 1
            remaining = self.MAX_ATTEMPTS - self.failed_attempts
            self.login_message.config(text="Access Denied", foreground="red")
            self.update_attempts_label()

            if remaining <= 0:
                self.start_lockout()

        self.login_entry.delete(0, tk.END)

    def update_attempts_label(self):
        """Show how many tries are left before lockout."""
        remaining = max(0, self.MAX_ATTEMPTS - self.failed_attempts)
        self.attempts_label.config(text=f"Attempts remaining: {remaining}")

    def start_lockout(self):
        """Disable login for a short period after too many failed attempts."""
        self.locked = True
        self.lock_seconds_remaining = self.LOCK_SECONDS
        self.login_entry.config(state="disabled")
        self.login_button.config(state="disabled")
        self.lock_message.config(
            text=f"System locked for {self.lock_seconds_remaining} seconds due to 3 failed attempts."
        )
        self.update_lock_countdown()

    def update_lock_countdown(self):
        """Update the countdown label once per second."""
        if self.lock_seconds_remaining > 0:
            self.lock_message.config(
                text=f"System locked for {self.lock_seconds_remaining} seconds due to 3 failed attempts."
            )
            self.lock_seconds_remaining -= 1
            self.root.after(1000, self.update_lock_countdown)
        else:
            self.locked = False
            self.failed_attempts = 0
            self.update_attempts_label()
            self.login_entry.config(state="normal")
            self.login_button.config(state="normal")
            self.lock_message.config(text="System unlocked. You may try again.", foreground="green")
            self.login_message.config(text="Lock period ended.", foreground="black")

    def run_attack_simulation(self):
        """Safely demonstrate how fast weak passwords can be guessed."""
        self.attack_button.config(state="disabled")
        self.attack_running = True
        target_config = self.get_attack_configuration()
        if target_config["mode"] == "estimate" and self.force_attack_var.get():
            target_config["mode"] = "force_crack"

        if target_config["mode"] == "crack":
            status_text = f"Running educational brute-force simulation against {target_config['label']}..."
        elif target_config["mode"] == "force_crack":
            status_text = (
                f"Force live crack enabled for {target_config['label']}. "
                "Large passwords may take a while..."
            )
        elif target_config["mode"] == "estimate":
            status_text = f"Estimating how hard it would be to brute-force {target_config['label']}..."
        else:
            status_text = f"Preparing the educational attack summary for {target_config['label']}..."

        self.attack_result.config(text=status_text)
        self.scroll_to_bottom()
        worker = threading.Thread(
            target=self.perform_attack_simulation,
            args=(target_config,),
            daemon=True,
        )
        worker.start()
        self.root.after(100, self.poll_attack_result_queue)

    def perform_attack_simulation(self, target_config):
        """Run the educational simulation without freezing the Tkinter window."""
        if target_config["mode"] == "unsupported":
            result_text = (
                "Live brute-force demo not available for this password.\n"
                f"Target: {target_config['label']}\n"
                "Reason: this beginner demo supports ASCII lowercase, uppercase, numbers, symbols, and spaces only.\n"
                f"Unsupported character sample: {target_config['unsupported_sample']}\n"
                "Tip: use a standard keyboard password to see a live crack or a time estimate."
            )
        elif target_config["mode"] == "estimate":
            attempts_per_second = self.benchmark_attack_speed(
                target_config["pattern_categories"],
                target_config["length"],
            )
            estimated_seconds = target_config["search_space"] / max(attempts_per_second, 1)
            result_text = (
                "Live crack skipped for safety.\n"
                f"Target: {target_config['label']}\n"
                f"Exact pattern searched: {target_config['pattern_description']}\n"
                f"Password length: {target_config['length']}\n"
                f"Possible combinations: {target_config['search_space']:,}\n"
                f"Estimated speed on this computer: {attempts_per_second:,.0f} guesses/second\n"
                f"Estimated time to try them all: {self.format_duration(estimated_seconds)}"
            )
        else:
            start_time = time.perf_counter()
            attempts, cracked_password = self.brute_force_hash(
                target_config["target_hash"],
                target_config["pattern_categories"],
                target_config["length"],
                target_config["search_space"],
            )
            elapsed_time = time.perf_counter() - start_time
            if target_config["mode"] == "force_crack":
                result_title = "Forced live brute-force simulation complete."
            else:
                result_title = "Safe educational simulation complete."
            result_text = (
                f"{result_title}\n"
                f"Target: {target_config['label']}\n"
                f"Exact pattern searched: {target_config['pattern_description']}\n"
                f"Password cracked: {cracked_password}\n"
                f"Number of attempts: {attempts:,}\n"
                f"Time taken: {elapsed_time:.6f} seconds"
            )

        self.attack_result_queue.put({"type": "final", "text": result_text})

    def poll_attack_result_queue(self):
        """Check whether the background worker has finished yet."""
        final_text = None

        while True:
            try:
                message = self.attack_result_queue.get_nowait()
            except queue.Empty:
                break

            if message["type"] == "progress":
                self.attack_result.config(text=message["text"])
                self.scroll_to_bottom()
            elif message["type"] == "final":
                final_text = message["text"]

        if final_text is not None:
            self.finish_attack_simulation(final_text)
            return

        if self.attack_running:
            self.root.after(100, self.poll_attack_result_queue)

    def finish_attack_simulation(self, result_text):
        """Update Tkinter widgets after the background attack worker finishes."""
        self.attack_running = False
        self.attack_result.config(text=result_text)
        self.attack_button.config(state="normal")
        self.scroll_to_bottom()
        messagebox.showinfo("Attack Simulation Result", result_text)

    def brute_force_hash(self, target_hash, pattern_categories, length, total_attempts):
        """Try every guess that matches the exact category counts."""
        attempts = 0
        start_time = time.perf_counter()
        last_progress_time = start_time

        for guess in self.generate_pattern_guesses(pattern_categories, length):
            attempts += 1
            current_time = time.perf_counter()

            if current_time - last_progress_time >= self.PROGRESS_UPDATE_SECONDS:
                self.queue_attack_progress(attempts, total_attempts, start_time, current_time)
                last_progress_time = current_time

            if self.hash_password(guess) == target_hash:
                self.queue_attack_progress(attempts, total_attempts, start_time, current_time)
                return attempts, guess

        return attempts, None

    def queue_attack_progress(self, attempts, total_attempts, start_time, current_time):
        """Send a progress update from the worker thread to the Tkinter thread."""
        progress_percent = 0
        if total_attempts > 0:
            progress_percent = (attempts / total_attempts) * 100

        elapsed_seconds = max(current_time - start_time, 0.000001)
        guesses_per_second = attempts / elapsed_seconds
        remaining_attempts = max(total_attempts - attempts, 0)
        remaining_seconds = remaining_attempts / guesses_per_second if guesses_per_second > 0 else 0

        progress_text = (
            "Attack in progress...\n"
            f"Attempts tried: {attempts:,} / {total_attempts:,} ({progress_percent:.2f}%)\n"
            f"Speed: {guesses_per_second:,.0f} guesses/second\n"
            f"Elapsed time: {self.format_duration(elapsed_seconds)}\n"
            f"Estimated time remaining: {self.format_duration(remaining_seconds)}"
        )
        self.attack_result_queue.put({"type": "progress", "text": progress_text})

    def benchmark_attack_speed(self, pattern_categories, length):
        """Measure a short sample so large passwords can show a time estimate."""
        attempts = 0
        start_time = time.perf_counter()

        for guess in itertools.islice(
            self.generate_pattern_guesses(pattern_categories, length),
            self.BENCHMARK_ATTEMPTS,
        ):
            attempts += 1
            self.hash_password(guess)

        elapsed_time = time.perf_counter() - start_time
        return attempts / max(elapsed_time, 0.000001)

    def generate_pattern_guesses(self, pattern_categories, length):
        """Yield guesses that match the exact pattern counts of the password."""
        category_state = [
            {
                "charset": category["charset"],
                "remaining": category["count"],
            }
            for category in pattern_categories
        ]
        current_guess = []
        yield from self._build_guess_from_pattern(category_state, current_guess, length)

    def _build_guess_from_pattern(self, category_state, current_guess, length):
        """Recursive helper that builds one guess at a time."""
        if len(current_guess) == length:
            yield "".join(current_guess)
            return

        for category in category_state:
            if category["remaining"] == 0:
                continue

            category["remaining"] -= 1
            for character in category["charset"]:
                current_guess.append(character)
                yield from self._build_guess_from_pattern(category_state, current_guess, length)
                current_guess.pop()
            category["remaining"] += 1

    def build_attack_profile(self, password):
        """Build metadata for the brute-force demo without storing the plain password."""
        pattern_categories = []
        unsupported_characters = sorted({character for character in password if character not in self.SUPPORTED_CHARSET})

        for singular_label, plural_label, charset in self.ATTACK_CATEGORIES:
            count = sum(1 for character in password if character in charset)
            if count == 0:
                continue

            pattern_categories.append(
                {
                    "singular": singular_label,
                    "plural": plural_label,
                    "charset": charset,
                    "count": count,
                }
            )

        if password.isdigit():
            label = f"your current hashed {len(password)}-digit PIN"
        else:
            label = f"your current hashed {len(password)}-character password"

        if unsupported_characters:
            unsupported_sample = ", ".join(repr(character) for character in unsupported_characters[:3])
            return {
                "supported": False,
                "label": label,
                "length": len(password),
                "unsupported_sample": unsupported_sample,
            }

        pattern_description = self.format_pattern_description(pattern_categories)
        search_space = self.calculate_pattern_search_space(pattern_categories, len(password))

        return {
            "supported": True,
            "label": label,
            "length": len(password),
            "pattern_categories": pattern_categories,
            "pattern_description": pattern_description,
            "search_space": search_space,
        }

    def get_demo_attack_configuration(self):
        """Return a weak fallback target when the user has not set a password yet."""
        demo_profile = self.build_attack_profile(self.DEMO_PASSWORD)
        return {
            "mode": "crack",
            "label": "the demo password 'ab1'",
            "length": demo_profile["length"],
            "pattern_categories": demo_profile["pattern_categories"],
            "pattern_description": demo_profile["pattern_description"],
            "search_space": demo_profile["search_space"],
            "target_hash": self.hash_password(self.DEMO_PASSWORD),
        }

    def get_attack_configuration(self):
        """Return the current target for the safe brute-force demo."""
        if self.password_hash is None or self.password_attack_profile is None:
            return self.get_demo_attack_configuration()

        target_config = dict(self.password_attack_profile)

        if not target_config["supported"]:
            target_config["mode"] = "unsupported"
            return target_config

        target_config["target_hash"] = self.password_hash

        if target_config["search_space"] <= self.LIVE_ATTACK_LIMIT:
            target_config["mode"] = "crack"
        else:
            target_config["mode"] = "estimate"

        return target_config

    def calculate_pattern_search_space(self, pattern_categories, length):
        """Count guesses using exact category totals instead of all characters at every position."""
        search_space = math.factorial(length)

        for category in pattern_categories:
            search_space //= math.factorial(category["count"])
            search_space *= len(category["charset"]) ** category["count"]

        return search_space

    def format_pattern_description(self, pattern_categories):
        """Describe the exact password pattern in plain language."""
        if not pattern_categories:
            return "unsupported characters"

        parts = []
        for category in pattern_categories:
            if category["count"] == 1:
                label = category["singular"]
            else:
                label = category["plural"]
            parts.append(f"{category['count']} {label}")

        if len(parts) == 1:
            return parts[0]

        return ", ".join(parts[:-1]) + f" and {parts[-1]}"

    def format_duration(self, seconds):
        """Convert a large number of seconds into a readable estimate."""
        if seconds < 1:
            return f"{seconds:.6f} seconds"
        if seconds < 60:
            return f"{seconds:.2f} seconds"

        minutes = seconds / 60
        if minutes < 60:
            return f"{minutes:.2f} minutes"

        hours = minutes / 60
        if hours < 24:
            return f"{hours:.2f} hours"

        days = hours / 24
        if days < 365:
            return f"{days:.2f} days"

        years = days / 365
        return f"{years:,.2f} years"

    def update_attack_target_label(self):
        """Explain whether the simulation will use the user's hash or the demo password."""
        if self.password_hash is None or self.password_attack_profile is None:
            self.attack_target_label.config(
                text="Current attack target: demo password 'ab1'.",
                foreground="blue",
            )
            return

        profile = self.password_attack_profile

        if not profile["supported"]:
            self.attack_target_label.config(
                text=(
                    f"Current attack target: {profile['label']}. "
                    "This password uses characters outside the demo's supported ASCII set, "
                    "so the app will show a warning instead of cracking it."
                ),
                foreground="blue",
            )
            self.scroll_to_bottom()
            return

        if profile["search_space"] <= self.LIVE_ATTACK_LIMIT:
            self.attack_target_label.config(
                text=(
                    f"Current attack target: {profile['label']} with the exact pattern {profile['pattern_description']}. "
                    f"This pattern needs {profile['search_space']:,} guesses, so the app will crack it live."
                ),
                foreground="green",
            )
            self.scroll_to_bottom()
            return

        if self.force_attack_var.get():
            self.attack_target_label.config(
                text=(
                    f"Current attack target: {profile['label']}. "
                    f"Exact pattern: {profile['pattern_description']}. "
                    f"Total guesses: {profile['search_space']:,}. "
                    "Force mode is on, so clicking Run Attack Simulation will start the live crack."
                ),
                foreground="orange",
            )
            self.scroll_to_bottom()
            return

        self.attack_target_label.config(
            text=(
                f"Current attack target: {profile['label']}. "
                f"Exact pattern: {profile['pattern_description']}. "
                f"Total guesses: {profile['search_space']:,}. "
                "so the app will estimate by default. Turn on 'Force Live Crack for Large Passwords' to try it anyway."
            ),
            foreground="blue",
        )
        self.scroll_to_bottom()


def main():
    root = tk.Tk()
    app = SecureLockSystemApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
