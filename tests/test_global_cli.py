import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from resume_god.paths import default_manifest_path, default_profile_path


ROOT = Path(__file__).resolve().parents[1]


class GlobalCliTests(unittest.TestCase):
    def test_default_profile_prefers_environment_then_local_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            local = root / "master_profile.yaml"
            local.write_text("version: 1\n", encoding="utf-8")
            configured = root / "custom-profile.yaml"
            configured.write_text("version: 1\n", encoding="utf-8")

            environment = os.environ.copy()
            environment["RESUME_GOD_PROFILE"] = str(configured)
            completed = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    "from resume_god.paths import default_profile_path;"
                    "print(default_profile_path())",
                ],
                check=True,
                capture_output=True,
                text=True,
                cwd=root,
                env=environment,
            )
            self.assertEqual(Path(completed.stdout.strip()), configured)

            environment.pop("RESUME_GOD_PROFILE")
            completed = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    "from resume_god.paths import default_profile_path;"
                    "print(default_profile_path())",
                ],
                check=True,
                capture_output=True,
                text=True,
                cwd=root,
                env=environment,
            )
            self.assertEqual(Path(completed.stdout.strip()), local)
            self.assertTrue(default_profile_path().is_file())

    def test_doctor_and_dispatch_commands_are_available(self):
        completed = subprocess.run(
            [sys.executable, "-m", "resume_god.cli", "doctor"],
            check=True,
            capture_output=True,
            text=True,
            cwd=ROOT,
        )
        self.assertIn("resume-god", completed.stdout)
        self.assertIn("Profile:", completed.stdout)
        self.assertIn("Typst:", completed.stdout)

        for command, text in (
            (["applications", "--help"], "Build audited application packets"),
            (["graph", "--help"], "Load and query the resume graph"),
            (["parse-jd", "--help"], "Parse a JD into normalized JSON"),
            (["tailor", "--help"], "Build a one-page Typst PDF"),
        ):
            with self.subTest(command=command):
                result = subprocess.run(
                    [sys.executable, "-m", "resume_god.cli", *command],
                    check=True,
                    capture_output=True,
                    text=True,
                    cwd=ROOT,
                )
                self.assertIn(text, result.stdout)

    def test_install_scripts_have_valid_shell_syntax(self):
        for script in ("install-cli.sh", "uninstall-cli.sh"):
            with self.subTest(script=script):
                subprocess.run(
                    ["bash", "-n", str(ROOT / "scripts" / script)],
                    check=True,
                )


if __name__ == "__main__":
    unittest.main()
