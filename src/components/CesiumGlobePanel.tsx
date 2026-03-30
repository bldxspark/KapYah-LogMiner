// File purpose: Cesium-based mission map with playback, route markers, and offline fallback behavior.
// KapYah LogMiner
// Maintained by Durgesh Tiwari, KapYah Industries Pvt. Ltd.
import { useEffect, useMemo, useRef } from "react";
import {
  ArcGisMapServerImageryProvider,
  CameraEventType,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  ConstantPositionProperty,
  createWorldTerrainAsync,
  EllipsoidTerrainProvider,
  GridImageryProvider,
  HeadingPitchRange,
  HorizontalOrigin,
  Math as CesiumMath,
  NearFarScalar,
  OpenStreetMapImageryProvider,
  VerticalOrigin,
  Viewer,
  type Entity,
} from "cesium";
import type { MapAnalysis } from "../types/analysis";
import droneMarker from "../assets/drone-marker.svg";

type CesiumGlobePanelProps = {
  routePoints: MapAnalysis["routePoints"];
  eventMarkers: MapAnalysis["eventMarkers"];
  currentIndex: number;
  currentTimeS: number | null;
  followDrone: boolean;
  resetToken: number;
};

const ALTITUDE_SCALE = 3;
const START_VIEW_PITCH = CesiumMath.toRadians(-10);
const START_VIEW_RANGE = 90;
const DRONE_MARKER_SCALE = 0.45;
const MAX_IMAGERY_RETRIES_BEFORE_OFFLINE = 3;

function buildRoutePositions(routePoints: MapAnalysis["routePoints"]) {
  return routePoints.map((point) =>
    Cartesian3.fromDegrees(point.lon, point.lat, Math.max(point.alt ?? 0, 0) * ALTITUDE_SCALE),
  );
}

function buildCurrentPosition(point: MapAnalysis["routePoints"][number]) {
  return Cartesian3.fromDegrees(point.lon, point.lat, Math.max(point.alt ?? 0, 0) * ALTITUDE_SCALE);
}

function interpolateValue(start: number | null, end: number | null, ratio: number) {
  const safeStart = start ?? 0;
  const safeEnd = end ?? safeStart;
  return safeStart + ((safeEnd - safeStart) * ratio);
}

function interpolateRoutePoint(
  routePoints: MapAnalysis["routePoints"],
  currentTimeS: number | null,
  fallbackIndex: number,
) {
  const fallbackPoint = routePoints[fallbackIndex] ?? routePoints[0] ?? null;
  if (!fallbackPoint || currentTimeS === null || routePoints.length <= 1) {
    return fallbackPoint;
  }

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const current = routePoints[index];
    const next = routePoints[index + 1];
    const currentTime = current?.timeS;
    const nextTime = next?.timeS;
    if (currentTime === null || nextTime === null) {
      continue;
    }

    if (currentTimeS < currentTime) {
      return current;
    }

    if (currentTimeS >= currentTime && currentTimeS <= nextTime) {
      // Keep playback motion smooth by interpolating between logged route samples.
      const span = Math.max(nextTime - currentTime, 0.001);
      const ratio = Math.min(Math.max((currentTimeS - currentTime) / span, 0), 1);
      return {
        ...current,
        lat: interpolateValue(current.lat, next.lat, ratio),
        lon: interpolateValue(current.lon, next.lon, ratio),
        alt: interpolateValue(current.alt, next.alt, ratio),
        speed: interpolateValue(current.speed, next.speed, ratio),
        timeS: currentTimeS,
      };
    }
  }

  return routePoints[routePoints.length - 1];
}

function computeHeadingDegrees(
  routePoints: MapAnalysis["routePoints"],
  index: number,
) {
  const current = routePoints[index];
  const next = routePoints[Math.min(index + 1, routePoints.length - 1)] ?? current;
  if (!current || !next) {
    return 0;
  }

  const lat1 = CesiumMath.toRadians(current.lat);
  const lat2 = CesiumMath.toRadians(next.lat);
  const dLon = CesiumMath.toRadians(next.lon - current.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const heading = Math.atan2(y, x);
  return CesiumMath.zeroToTwoPi(heading);
}

function applyOfflineImagery(viewer: Viewer) {
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(
    new GridImageryProvider({
      backgroundColor: Color.fromCssColorString("#0b1520"),
      glowColor: Color.fromCssColorString("#17344c"),
      color: Color.fromCssColorString("#284761"),
      cells: 10,
      tileWidth: 512,
      tileHeight: 512,
    }),
  );
}

function attachImageryFallback(
  viewer: Viewer,
  onFailure: () => void,
  provider: { errorEvent?: { addEventListener: (listener: (error: { timesRetried?: number }) => void) => () => void } },
  layer?: { errorEvent?: { addEventListener: (listener: () => void) => () => void } },
) {
  let hasFailedOver = false;
  const failOver = () => {
    if (hasFailedOver || viewer.isDestroyed()) {
      return;
    }
    hasFailedOver = true;
    onFailure();
  };

  const removeProviderListener = provider.errorEvent?.addEventListener((error) => {
    if ((error?.timesRetried ?? 0) >= MAX_IMAGERY_RETRIES_BEFORE_OFFLINE) {
      failOver();
    }
  });
  const removeLayerListener = layer?.errorEvent?.addEventListener(() => {
    failOver();
  });

  return () => {
    removeProviderListener?.();
    removeLayerListener?.();
  };
}

async function applyImagery(viewer: Viewer, setImageryCleanup: (cleanup: (() => void) | null) => void) {
  viewer.imageryLayers.removeAll();
  setImageryCleanup(null);

  // If the browser already reports offline, skip remote imagery providers immediately.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    applyOfflineImagery(viewer);
    return;
  }

  try {
    const satellite = await ArcGisMapServerImageryProvider.fromUrl(
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
    );
    const layer = viewer.imageryLayers.addImageryProvider(satellite);
    setImageryCleanup(
      attachImageryFallback(viewer, () => {
        void applyOpenStreetMapImagery(viewer, setImageryCleanup);
      }, satellite, layer),
    );
  } catch {
    await applyOpenStreetMapImagery(viewer, setImageryCleanup);
  }
}

async function applyOpenStreetMapImagery(
  viewer: Viewer,
  setImageryCleanup: (cleanup: (() => void) | null) => void,
) {
  try {
    const provider = new OpenStreetMapImageryProvider({
      url: "https://tile.openstreetmap.org/",
    });
    const layer = viewer.imageryLayers.addImageryProvider(provider);
    setImageryCleanup(
      attachImageryFallback(viewer, () => {
        applyOfflineImagery(viewer);
        setImageryCleanup(null);
      }, provider, layer),
    );
  } catch {
    applyOfflineImagery(viewer);
    setImageryCleanup(null);
  }
}

async function applyTerrainStyle(viewer: Viewer, setTerrainCleanup: (cleanup: (() => void) | null) => void) {
  setTerrainCleanup(null);

  // Terrain is optional. Route/playback should still work with a plain ellipsoid globe.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    viewer.terrainProvider = new EllipsoidTerrainProvider();
  } else {
    try {
      viewer.terrainProvider = await createWorldTerrainAsync({
        requestVertexNormals: true,
        requestWaterMask: true,
      });
      setTerrainCleanup(
        viewer.terrainProvider.errorEvent.addEventListener(() => {
          if (!viewer.isDestroyed()) {
            viewer.terrainProvider = new EllipsoidTerrainProvider();
            setTerrainCleanup(null);
          }
        }),
      );
    } catch {
      viewer.terrainProvider = new EllipsoidTerrainProvider();
    }
  }

  const usingOfflineTerrain = viewer.terrainProvider instanceof EllipsoidTerrainProvider;
  viewer.scene.globe.enableLighting = !usingOfflineTerrain;
  viewer.scene.fog.enabled = !usingOfflineTerrain;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = !usingOfflineTerrain;
  }
}

function setOfflineListeners(
  viewer: Viewer,
  setImageryCleanup: (cleanup: (() => void) | null) => void,
  setTerrainCleanup: (cleanup: (() => void) | null) => void,
) {
  const handleOffline = () => {
    // A runtime network drop should immediately preserve map interaction with offline-safe layers.
    applyOfflineImagery(viewer);
    setImageryCleanup(null);
    viewer.terrainProvider = new EllipsoidTerrainProvider();
    setTerrainCleanup(null);
    viewer.scene.globe.enableLighting = false;
    viewer.scene.fog.enabled = false;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = false;
    }
  };

  window.addEventListener("offline", handleOffline);
  return () => {
    window.removeEventListener("offline", handleOffline);
  };
}

function setGroundStartView(
  viewer: Viewer,
  routePoints: MapAnalysis["routePoints"],
  currentIndex: number,
  options?: {
    duration?: number;
  },
) {
  const point = routePoints[currentIndex] ?? routePoints[0];
  if (!point) {
    return;
  }

  const target = buildCurrentPosition(point);
  const heading = computeHeadingDegrees(routePoints, currentIndex);
  viewer.camera.flyTo({
    destination: target,
    duration: options?.duration ?? 2.2,
    orientation: {
      heading: CesiumMath.zeroToTwoPi(heading + Math.PI),
      pitch: START_VIEW_PITCH,
      roll: 0,
    },
    complete: () => {
      viewer.camera.lookAt(
        target,
        new HeadingPitchRange(
          CesiumMath.zeroToTwoPi(heading + Math.PI),
          START_VIEW_PITCH,
          START_VIEW_RANGE,
        ),
      );
    },
  });
}

export default function CesiumGlobePanel({
  routePoints,
  eventMarkers,
  currentIndex,
  currentTimeS,
  followDrone,
  resetToken,
}: CesiumGlobePanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const droneEntityRef = useRef<Entity | null>(null);
  const activeTrackRef = useRef<Entity | null>(null);
  const imageryCleanupRef = useRef<(() => void) | null>(null);
  const terrainCleanupRef = useRef<(() => void) | null>(null);
  const routePositions = useMemo(() => buildRoutePositions(routePoints), [routePoints]);

  useEffect(() => {
    if (!hostRef.current || viewerRef.current) {
      return;
    }

    const viewer = new Viewer(hostRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      shouldAnimate: true,
    });

    viewer.scene.screenSpaceCameraController.enableInputs = true;
    viewer.scene.screenSpaceCameraController.enableRotate = true;
    viewer.scene.screenSpaceCameraController.enableTranslate = true;
    viewer.scene.screenSpaceCameraController.enableZoom = true;
    viewer.scene.screenSpaceCameraController.enableTilt = true;
    viewer.scene.screenSpaceCameraController.enableLook = true;
    viewer.scene.screenSpaceCameraController.tiltEventTypes = [
      CameraEventType.MIDDLE_DRAG,
      CameraEventType.PINCH,
    ];
    viewer.scene.screenSpaceCameraController.inertiaSpin = 0.84;
    viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.82;
    viewer.scene.screenSpaceCameraController.inertiaZoom = 0.8;
    viewer.scene.screenSpaceCameraController.maximumMovementRatio = 0.008;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 5;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 5000000;
    viewer.scene.screenSpaceCameraController.zoomFactor = 0.35;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    viewer.scene.globe.baseColor = Color.fromCssColorString("#0d1621");
    viewer.scene.backgroundColor = Color.fromCssColorString("#08111a");
    (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = "none";

    viewerRef.current = viewer;
    void applyImagery(viewer, (cleanup) => {
      imageryCleanupRef.current?.();
      imageryCleanupRef.current = cleanup;
    });
    void applyTerrainStyle(viewer, (cleanup) => {
      terrainCleanupRef.current?.();
      terrainCleanupRef.current = cleanup;
    });
    const removeOfflineListener = setOfflineListeners(
      viewer,
      (cleanup) => {
        imageryCleanupRef.current?.();
        imageryCleanupRef.current = cleanup;
      },
      (cleanup) => {
        terrainCleanupRef.current?.();
        terrainCleanupRef.current = cleanup;
      },
    );

    return () => {
      removeOfflineListener();
      imageryCleanupRef.current?.();
      terrainCleanupRef.current?.();
      viewer.destroy();
      viewerRef.current = null;
      droneEntityRef.current = null;
      activeTrackRef.current = null;
      imageryCleanupRef.current = null;
      terrainCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    viewer.entities.removeAll();
    droneEntityRef.current = null;
    activeTrackRef.current = null;

    if (!routePositions.length) {
      return;
    }

    viewer.entities.add({
      name: "Mission Route",
      polyline: {
        positions: routePositions,
        width: 2,
        material: Color.fromCssColorString("#ff5f57"),
        clampToGround: false,
      },
    });

    viewer.entities.add({
      name: "Mission Start",
      position: routePositions[0],
      point: {
        pixelSize: 10,
        color: Color.fromCssColorString("#3aa0ff"),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
      },
    });

    viewer.entities.add({
      name: "Mission End",
      position: routePositions[routePositions.length - 1],
      point: {
        pixelSize: 10,
        color: Color.fromCssColorString("#ffffff"),
        outlineColor: Color.fromCssColorString("#0a1018"),
        outlineWidth: 2,
      },
    });

    eventMarkers
      .filter((event) => event.severity === "warning" || event.severity === "error")
      .slice(0, 24)
      .forEach((event) => {
      const eventTime = event.timeS;
      if (eventTime === null) {
        return;
      }

      const nearestIndex = routePoints.findIndex(
        (point) => point.timeS !== null && point.timeS >= eventTime,
      );
      const point = routePoints[Math.max(nearestIndex, 0)];
      if (!point) {
        return;
      }

      viewer.entities.add({
        name: event.label,
        position: Cartesian3.fromDegrees(
          point.lon,
          point.lat,
          ((point.alt ?? 0) * 8) + 50,
        ),
        point: {
          pixelSize: 6,
          color:
            event.severity === "error"
              ? Color.fromCssColorString("#ff5f57")
              : event.severity === "warning"
                ? Color.fromCssColorString("#f0b14a")
                : Color.fromCssColorString("#93a4bd"),
        },
      });
      });

    const initialPosition = routePositions[0];
    droneEntityRef.current = viewer.entities.add({
      name: "Mission Drone",
      position: new ConstantPositionProperty(initialPosition),
      billboard: {
        image: droneMarker,
        scale: DRONE_MARKER_SCALE,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new NearFarScalar(50, 1, 2000, 0.22),
      },
    });

    activeTrackRef.current = viewer.entities.add({
      name: "Active Route",
      polyline: {
        positions: new ConstantProperty([initialPosition]),
        width: 3,
        material: new ColorMaterialProperty(Color.fromCssColorString("#ffffff")),
        clampToGround: false,
      },
    });

    setGroundStartView(viewer, routePoints, 0, { duration: 2.8 });
  }, [eventMarkers, routePoints, routePositions]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const droneEntity = droneEntityRef.current;
    const activeTrack = activeTrackRef.current;
    const currentPoint = interpolateRoutePoint(routePoints, currentTimeS, currentIndex);

    if (!viewer || !droneEntity || !currentPoint) {
      return;
    }

    const target = buildCurrentPosition(currentPoint);
    droneEntity.position = new ConstantPositionProperty(target);
    if (activeTrack?.polyline) {
      const visibleTrackPoints = routePoints
        .filter((point) => point.timeS !== null && currentTimeS !== null && point.timeS <= currentTimeS)
        .map((point) => buildCurrentPosition(point));
      activeTrack.polyline.positions = new ConstantProperty([...visibleTrackPoints, target]);
    }
  }, [currentIndex, currentTimeS, routePoints]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const droneEntity = droneEntityRef.current;
    if (!viewer || !droneEntity) {
      return;
    }

    if (followDrone) {
      viewer.trackedEntity = droneEntity;
      return;
    }

    viewer.trackedEntity = undefined;
  }, [followDrone, resetToken]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !routePoints.length) {
      return;
    }

    viewer.trackedEntity = undefined;
    setGroundStartView(viewer, routePoints, 0, { duration: 1.2 });
  }, [resetToken, routePoints]);

  return (
    <div className="cesium-shell cesium-shell-immersive">
      <div ref={hostRef} className="cesium-panel" />
    </div>
  );
}
