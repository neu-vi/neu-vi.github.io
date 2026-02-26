#!/usr/bin/env python3
"""Build force user study videos and manifest from source folders."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

METHODS_REQUIRED = {
    "wind": ["force_prompting", "text_inference", "ours_autoregressive"],
    "wind_change": ["force_prompting", "text_inference", "ours_autoregressive"],
    "point": ["force_prompting", "text_inference", "ours_autoregressive", "kling_motion_brush"],
    "point_change": ["force_prompting", "text_inference", "ours_autoregressive", "kling_motion_brush"],
}

METHOD_PREFIXES = [
    "kling_motion_brush_",
    "ours_autoregressive_",
    "force_prompting_",
    "text_inference_",
]


def parse_folder_name(name: str) -> Optional[Tuple[str, str]]:
    method = None
    for prefix in METHOD_PREFIXES:
        if name.startswith(prefix):
            method = prefix[:-1]
            break

    if method is None:
        return None

    if "_wind_" in name:
        base = "wind"
    elif "_point_" in name:
        base = "point"
    else:
        return None

    condition = f"{base}_change" if "_change" in name else base
    return method, condition


def list_mp4_files(folder: Path) -> Tuple[Set[str], int]:
    names: Set[str] = set()
    skipped_non_mp4 = 0

    if not folder.exists() or not folder.is_dir():
        return names, skipped_non_mp4

    for item in folder.iterdir():
        if not item.is_file():
            continue
        if item.suffix.lower() == ".mp4":
            names.add(item.name)
        else:
            skipped_non_mp4 += 1

    return names, skipped_non_mp4


def copy_case(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build force_user_study videos and manifest")
    parser.add_argument("--source", default="../final", help="Source root containing method folders")
    parser.add_argument(
        "--out_videos_dir",
        default="user-study/force_user_study/videos",
        help="Output videos directory inside repo",
    )
    parser.add_argument(
        "--out_manifest",
        default="user-study/force_user_study/manifest.json",
        help="Output manifest JSON path",
    )
    args = parser.parse_args()

    source_root = Path(args.source).resolve()
    out_videos_dir = Path(args.out_videos_dir).resolve()
    out_manifest = Path(args.out_manifest).resolve()
    manifest_parent = out_manifest.parent

    folder_map: Dict[str, Dict[str, Path]] = {
        "wind": {},
        "point": {},
        "wind_change": {},
        "point_change": {},
    }

    unknown_folders: List[str] = []
    if not source_root.exists() or not source_root.is_dir():
        raise FileNotFoundError(f"Source directory not found: {source_root}")

    for child in sorted(source_root.iterdir()):
        if not child.is_dir():
            continue
        parsed = parse_folder_name(child.name)
        if parsed is None:
            unknown_folders.append(child.name)
            continue
        method, condition = parsed
        folder_map[condition][method] = child

    non_mp4_total = 0
    summary_cases: Dict[str, int] = {}
    summary_skipped_missing: Dict[str, int] = {}
    missing_method_folders: Dict[str, List[str]] = {}

    manifest = {
        "version": 1,
        "conditions": {},
    }

    for condition, required_methods in METHODS_REQUIRED.items():
        method_to_files: Dict[str, Set[str]] = {}
        missing_methods: List[str] = []

        for method in required_methods:
            folder = folder_map.get(condition, {}).get(method)
            if folder is None:
                missing_methods.append(method)
                method_to_files[method] = set()
                continue
            files, skipped_non_mp4 = list_mp4_files(folder)
            non_mp4_total += skipped_non_mp4
            method_to_files[method] = files

        if missing_methods:
            missing_method_folders[condition] = missing_methods

        if any(not method_to_files[m] for m in required_methods):
            valid_case_ids: Set[str] = set()
        else:
            valid_case_ids = set.intersection(*(method_to_files[m] for m in required_methods))

        union_case_ids: Set[str] = set()
        for m in required_methods:
            union_case_ids |= method_to_files[m]

        skipped_missing = len(union_case_ids - valid_case_ids)
        summary_skipped_missing[condition] = skipped_missing

        sorted_case_ids = sorted(valid_case_ids)
        summary_cases[condition] = len(sorted_case_ids)

        condition_entry = {
            "methods": required_methods,
            "cases": [],
        }

        for case_id in sorted_case_ids:
            videos = {}
            for method in required_methods:
                source_folder = folder_map[condition][method]
                src = source_folder / case_id
                dst = out_videos_dir / condition / method / case_id
                copy_case(src, dst)
                videos[method] = str(dst.relative_to(manifest_parent)).replace("\\", "/")

            condition_entry["cases"].append(
                {
                    "id": case_id,
                    "videos": videos,
                }
            )

        manifest["conditions"][condition] = condition_entry

    out_manifest.parent.mkdir(parents=True, exist_ok=True)
    out_videos_dir.mkdir(parents=True, exist_ok=True)

    with out_manifest.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print("Build summary")
    print(f"Source root: {source_root}")
    print(f"Output videos dir: {out_videos_dir}")
    print(f"Output manifest: {out_manifest}")

    print("\nCases per condition:")
    for condition in ["wind", "point", "wind_change", "point_change"]:
        print(f"- {condition}: {summary_cases.get(condition, 0)}")

    print("\nMissing method folders:")
    if not missing_method_folders:
        print("- None")
    else:
        for condition, methods in missing_method_folders.items():
            print(f"- {condition}: {', '.join(methods)}")

    print("\nSkipped cases due to missing videos across required methods:")
    for condition in ["wind", "point", "wind_change", "point_change"]:
        print(f"- {condition}: {summary_skipped_missing.get(condition, 0)}")

    print(f"\nSkipped non-mp4 files: {non_mp4_total}")

    if unknown_folders:
        print("\nIgnored source folders that did not match naming rules:")
        for name in unknown_folders:
            print(f"- {name}")


if __name__ == "__main__":
    main()
