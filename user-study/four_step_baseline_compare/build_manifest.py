#!/usr/bin/env python3
"""Build both parts of the four-step video user study."""

import json
import shutil
from pathlib import Path


STUDY_DIR = Path(__file__).resolve().parent
DEMO_ROOT = Path("/mnt/localssd/recovered_eval/demo_generation_8models_demos100_v1")
PROMPT_PATH = Path(
    "/mnt/localssd/recovered_training_lines/workspaces/causal_forcing_init_1x8/"
    "One-Forcing/prompts/demos.txt"
)

PARTS = [
    {
        "id": "baseline_compare",
        "number": 1,
        "title": "Four-Step Baseline Comparison",
        "indices": [
            4, 8, 9, 19, 20,
            23, 27, 29, 32, 33,
            36, 37, 39, 42, 43,
            46, 49, 50, 57, 58,
        ],
        "models": {
            "causvid_shift5": "12_causvid_warp4_cfg2",
            "self_forcing": "01_self_forcing",
            "causal_forcing": "02_causal_forcing",
            "ours_raft5e4": "04_ours_ode_bw1_text_raft5e4_step20",
        },
        "metrics": [
            {
                "key": "text_alignment",
                "title": "1) Text alignment",
                "help": "Which video follows the prompt most accurately?",
            },
            {
                "key": "visual_quality",
                "title": "2) Visual quality",
                "help": "Which video looks the most realistic, detailed, aesthetically pleasing, and free of artifacts?",
            },
        ],
    },
    {
        "id": "dynamic_compare",
        "number": 2,
        "title": "Four-Step Dynamic Comparison",
        "indices": [0, 1, 2, 7, 15, 22, 26, 28, 34, 47],
        "models": {
            "ours_no_raft": "03_ours_ode_bw1_text_noraft_step20",
            "ours_raft5e4": "04_ours_ode_bw1_text_raft5e4_step20",
        },
        "metrics": [
            {
                "key": "dynamic_preference",
                "title": "1) Dynamics",
                "help": "Which video has greater dynamics, considering both camera motion and subject/object motion?",
            },
            {
                "key": "visual_quality",
                "title": "2) Visual quality",
                "help": "Which video do you prefer in terms of visual quality?",
            },
            {
                "key": "text_alignment",
                "title": "3) Text alignment",
                "help": "Which video do you prefer in terms of text alignment?",
            },
        ],
    },
]


def build_cases(prompts: list[str], part: dict) -> list[dict]:
    cases = []
    for index in part["indices"]:
        if index >= len(prompts):
            raise ValueError(f"Prompt index {index} is out of range")

        videos = {}
        filename = f"{index:04d}.mp4"
        for method, source_dir in part["models"].items():
            source = DEMO_ROOT / source_dir / "videos" / filename
            if not source.is_file() or source.stat().st_size == 0:
                raise FileNotFoundError(source)

            relative = Path("videos") / method / filename
            destination = STUDY_DIR / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            videos[method] = relative.as_posix()

        cases.append(
            {
                "id": f"demo_{index:04d}",
                "source_index_0based": index,
                "prompt": prompts[index],
                "videos": videos,
            }
        )
    return cases


def main() -> None:
    prompts = PROMPT_PATH.read_text(encoding="utf-8").splitlines()
    manifest_parts = []
    for part in PARTS:
        manifest_parts.append(
            {
                "id": part["id"],
                "number": part["number"],
                "title": part["title"],
                "methods": list(part["models"]),
                "metrics": part["metrics"],
                "cases": build_cases(prompts, part),
            }
        )

    manifest = {
        "version": 2,
        "study_id": "four_step_video_user_study_v1",
        "title": "Four-Step Video User Study",
        "parts": manifest_parts,
    }
    (STUDY_DIR / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    total_cases = sum(len(part["cases"]) for part in manifest_parts)
    total_assignments = sum(
        len(part["cases"]) * len(part["methods"]) for part in manifest_parts
    )
    print(f"Built {len(manifest_parts)} parts, {total_cases} cases, and {total_assignments} video assignments")


if __name__ == "__main__":
    main()
