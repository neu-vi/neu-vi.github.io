# Four-Step Video User Study

The local study contains two parts:

- Part 1: 20 zero-based demo indices and four anonymized baselines per question.
- Part 2: 10 zero-based demo indices comparing ours without RAFT against ours
  with RAFT weight 5e-4.

Part 1 methods:

- CausVid warp-4step CFG2 checkpoint, evaluated with the local inference path and shift 5
- Self-Forcing
- Causal-Forcing
- Ours, causal-ODE init, text + BW1, RAFT weight 5e-4, step 20

The browser deterministically randomizes A/B/C/D (Part 1) or A/B (Part 2) for
every participant and question. The submitted payload records both displayed
labels and decoded method IDs.

`SUBMIT_ENDPOINT` is intentionally empty. Submitting the preview downloads a JSON
file to the participant's computer and sends nothing online.

Rebuild the manifest and copied video assets with:

```bash
python3 build_manifest.py
```

Serve the repository root, then open:

```text
/user-study/four_step_baseline_compare/
```
