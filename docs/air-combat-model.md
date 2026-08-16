# Air-combat model basis

This project is a visual, deterministic 1v1 training scenario. It uses public aviation references to choose the order of events and the quantities that matter to the simulation, but it does not claim to reproduce a real aircraft, classified sensor, missile, or pilot model.

## Tactical sequence

The scenario keeps the following concepts separate:

1. Sensor search, contact, track, and positive identification (PID).
2. Rules of engagement: `WEAPONS HOLD` → `PID CONFIRM` → `WEAPONS FREE`.
3. BVR commit and missile employment inside a simplified weapon envelope.
4. Support-track / defensive break and seeker loss or proximity-fuse outcome.
5. Visual merge, WVR nose/energy manoeuvring, extension, and separation.

The phase names and the distinction between pre-commit, commit, targeting/weapons employment, merge, and post-merge flow are based on the publicly available U.S. Air Force multi-service tactics publication:

- [ATP 3-52.4 / MCRP 3-20F.10 / NTTP 6-02.9 / AFTTP 3-2.8](https://static.e-publishing.af.mil/production/1/lemay_center/publication/afttp3-2.8/afttp3-2.8.pdf)
- [AFMAN 11-2T-38V3, Basic Fighter Maneuvers / Air Combat Maneuvering briefing guide](https://static.e-publishing.af.mil/production/1/af_a3/publication/afman11-2t-38v3/afman11-2t-38v3.pdf)

The implementation is intentionally 1v1: there is no wingman, datalink network, controller, electronic warfare, or formation coordination model.

## Flight and force model

The visual fighter is attached to a Rapier dynamic rigid body. Every simulation step is `1/120 s`; the controller applies forces and torques, and Rapier integrates the resulting translation and attitude. The model uses:

- 10 metres per world unit, explicit mass, gravity, thrust, wing area, and inertia supplied by the rigid body.
- Dynamic pressure `q = 1/2 ρV²`, ISA troposphere density, angle-of-attack-dependent lift, induced drag, parasite drag, sideslip drag, and thrust.
- A bounded control-surface acceleration envelope of 8G, a banked attitude controller, and velocity-vector recovery when attitude and flight path diverge.
- Specific mechanical energy `E = 1/2 V² + gh`, Mach, dynamic pressure, angle of attack, load factor, and measured acceleration in diagnostics.

The aerodynamic equations follow the public NASA explanations of lift, drag, dynamic pressure, and integrated equations of motion:

- [NASA Glenn: Lift equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/)
- [NASA Glenn: Lift-to-drag ratio](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-to-drag-ratio/)
- [NASA Glenn: Equations of motion](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/equations-of-motion/)
- [FAA Airplane Flying Handbook, angle of attack and load factor](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/06_afh_ch5.pdf)

## What the model does not claim

The coefficients, thrust, mass, sensor ranges, missile envelope, and fighter geometry are authored scenario values. There is no CFD, engine spool model, fuel burn, atmospheric wind field, radar cross-section, ECM/chaff/flare model, classified weapon guidance law, or real-world aircraft performance validation. A passing verification run proves that the deterministic implementation and its invariants hold; it does not turn the result into operational training software.
