import tempfile
import unittest
from pathlib import Path

import yaml
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from resume_god.db import Base, ensure_owner
from resume_god.profiles import (
    get_active_profile,
    get_profile_version,
    import_profile,
    list_profiles,
    validate_profile_dict,
)

ROOT = Path(__file__).resolve().parents[1]


class ProfileStoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        engine = create_engine(f"sqlite:///{self.directory.name}/t.db")
        Base.metadata.create_all(engine)
        self.sessions = sessionmaker(bind=engine, expire_on_commit=False)
        with open(ROOT / "master_profile.yaml", encoding="utf-8") as handle:
            self.profile = yaml.safe_load(handle)

    def test_import_versions_and_active_flips(self):
        with self.sessions() as session:
            user = ensure_owner(session)
            first = import_profile(session, user.id, self.profile)
            self.assertEqual(first.version, 1)
            self.assertTrue(first.is_active)
            second = import_profile(session, user.id, self.profile)
            self.assertEqual(second.version, 2)
            versions = list_profiles(session, user.id)
            self.assertEqual([row["version"] for row in versions], [2, 1])
            active_flags = {row["version"]: row["is_active"] for row in versions}
            self.assertEqual(active_flags, {2: True, 1: False})

    def test_active_roundtrip_matches_yaml(self):
        with self.sessions() as session:
            user = ensure_owner(session)
            import_profile(session, user.id, self.profile)
            active = get_active_profile(session, user.id)
            assert active is not None
            self.assertEqual(active["status"], "user_reviewed")
            self.assertEqual(
                len(active["achievements"]), len(self.profile["achievements"])
            )
            self.assertEqual(
                get_profile_version(session, user.id, 1)["contact"]["email"],
                self.profile["contact"]["email"],
            )

    def test_import_rejects_bad_shape(self):
        with self.sessions() as session:
            user = ensure_owner(session)
            with self.assertRaises(ValueError):
                import_profile(session, user.id, {"status": "draft"})
            self.assertTrue(validate_profile_dict({"status": "draft"}))

    def test_no_active_without_import(self):
        with self.sessions() as session:
            user = ensure_owner(session)
            self.assertIsNone(get_active_profile(session, user.id))
            self.assertEqual(list_profiles(session, user.id), [])


if __name__ == "__main__":
    unittest.main()
