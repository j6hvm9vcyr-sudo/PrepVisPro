import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { validateProject } from "./schema";
import { newProject } from "./defaults";
import { produce } from "immer";
import { addElements, addFloorPlan, newFloorPlan } from "./floorOps";
import { sampleProjectMultiCam } from "./sample";

describe("mise à niveau des fichiers", () => {
  it("format 1 → 3 : ajoute texte de scène et dépouillement, le reste est intact", () => {
    const v2 = newProject("X");
    const { floorPlans: _f, ...noFloor } = v2;
    const v1 = JSON.parse(
      JSON.stringify({
        ...noFloor,
        schemaVersion: 1,
        sequences: v2.sequences.map(
          ({ scriptText: _s, breakdown: _b, ...rest }) => rest,
        ),
      }),
    );
    const m = migrate(v1);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toEqual(v2);
  });
  it("format 9 → 10 : projecteurs sans gélatine, aucune matière de réflecteur", () => {
    const cur = newProject("X");
    const { reflectors: _r, ...settings9 } = cur.settings;
    const v9 = JSON.parse(
      JSON.stringify({
        ...cur,
        schemaVersion: 9,
        settings: settings9,
        floorPlans: [
          {
            id: "fp",
            name: "P",
            sequenceIds: [],
            background: null,
            scale: null,
            fovLengthM: 6,
            elements: [
              {
                id: "l",
                kind: "light",
                at: { x: 0, y: 0 },
                rotation: 0,
                fixtureId: null,
                mode: 0,
                dimmer: 1,
                lossStops: 0.5,
                circuit: "",
                label: "",
                icon: null,
                size: 40,
              },
            ],
          },
        ],
      }),
    );
    const m = migrate(v9);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.settings.reflectors).toEqual([]);
    expect(r.doc.floorPlans[0]!.elements[0]).toMatchObject({
      gels: [],
      lossStops: 0.5,
    });
  });
  it("format 10 → 11 : soleil (aucune position, aucun nord, aucune heure, fuseau de l’ordinateur)", () => {
    const cur = newProject("X");
    const { timeZone: _t, ...settings10 } = cur.settings;
    const v10 = JSON.parse(
      JSON.stringify({
        ...cur,
        schemaVersion: 10,
        settings: settings10,
        sequences: cur.sequences.map(({ gps: _g, ...rest }) => rest),
        floorPlans: [
          {
            id: "fp",
            name: "P",
            sequenceIds: [],
            background: null,
            scale: null,
            fovLengthM: 6,
            elements: [],
          },
        ],
      }),
    );
    const m = migrate(v10);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.settings.timeZone).toBeNull();
    expect(r.doc.sequences.every((s) => s.gps === null)).toBe(true);
    expect(r.doc.floorPlans[0]).toMatchObject({ northDeg: null, sunAt: null });
  });
  it("relecture à l’identique (projet avec plan au sol et tous les éléments)", () => {
    let d = addFloorPlan(sampleProjectMultiCam(), {
      ...newFloorPlan("P", []),
      northDeg: 12,
      sunAt: { date: "2026-06-21", time: "14:00" },
    });
    d = produce(d, (x) => {
      x.settings.fixtures.push({
        id: "f",
        name: "F",
        watts: null,
        kind: "led",
        modes: [{ label: "", lux: null, distanceM: null, beamDeg: null }],
      });
      x.settings.reflectors.push({
        id: "r",
        name: "Poly",
        type: "diffuse",
        reflectance: 0.8,
        presetId: null,
      });
      x.settings.timeZone = "Europe/Paris";
      x.sequences[0]!.gps = { lat: 48.85, lon: 2.35 };
    });
    d = addElements(d, d.floorPlans[0]!.id, [
      {
        id: "a",
        kind: "actor",
        at: { x: 1, y: 2 },
        rotation: 0,
        name: "A",
        color: "#000000",
        path: [],
        icon: null,
        size: 40,
      },
      {
        id: "c",
        kind: "camera",
        at: { x: 1, y: 2 },
        rotation: 0,
        planId: null,
        setupId: null,
        showFov: true,
        path: [],
      },
      {
        id: "i",
        kind: "icon",
        at: { x: 1, y: 2 },
        rotation: 0,
        icon: "icons/x.png",
        label: "",
        size: 40,
      },
      {
        id: "t",
        kind: "text",
        at: { x: 1, y: 2 },
        rotation: 0,
        text: "T",
        size: 14,
      },
      {
        id: "l",
        kind: "light",
        at: { x: 1, y: 2 },
        rotation: 0,
        fixtureId: "f",
        mode: 0,
        dimmer: 1,
        gels: ["lee-216"],
        lossStops: 0,
        circuit: "",
        label: "",
        icon: null,
        size: 40,
      },
      {
        id: "b",
        kind: "reflector",
        at: { x: 1, y: 2 },
        rotation: 0,
        materialId: "r",
        widthM: 1.22,
        heightM: 1.22,
        label: "",
        icon: null,
        size: 40,
      },
    ]);
    const r = validateProject(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toStrictEqual(d);
  });
  it("format 12 → 13 : icônes des personnages et réflecteurs (aucune), matières sans preset", () => {
    const cur = newProject("X");
    const v12 = JSON.parse(
      JSON.stringify({
        ...cur,
        schemaVersion: 12,
        settings: {
          ...cur.settings,
          reflectors: [
            { id: "m", name: "Poly", type: "diffuse", reflectance: 0.8 },
          ],
        },
        floorPlans: [
          {
            id: "fp",
            name: "P",
            sequenceIds: [],
            background: null,
            scale: null,
            fovLengthM: 6,
            northDeg: null,
            sunAt: null,
            elements: [
              {
                id: "a",
                kind: "actor",
                at: { x: 0, y: 0 },
                rotation: 0,
                name: "A",
                color: "#000",
                path: [],
              },
              {
                id: "r",
                kind: "reflector",
                at: { x: 0, y: 0 },
                rotation: 0,
                materialId: "m",
                widthM: 1,
                heightM: 1,
                label: "",
              },
            ],
          },
        ],
      }),
    );
    const m = migrate(v12);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = validateProject(m.raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.settings.reflectors[0]).toMatchObject({
      reflectance: 0.8,
      presetId: null,
    });
    expect(
      r.doc.floorPlans[0]!.elements.map((e) => ("icon" in e ? e.icon : "x")),
    ).toEqual([null, null]);
  });
  it("refuse ce qui n’est pas un projet", () => {
    expect(migrate(null).ok).toBe(false);
    expect(migrate({}).ok).toBe(false);
    expect(migrate({ schemaVersion: 99 }).ok).toBe(false);
  });
});
