import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MainLayout from "../../components/MainLayout";
import "../../assets/Tagging/TaggingMaps.css";

export interface TaggingMarkerData {
  id: string;
  lat: number;
  lng: number;
  type: string;
  label?: string;
  keterangan?: string;
}

const TaggingMaps: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const initialMarkers: TaggingMarkerData[] =
    location.state?.markers || location.state?.existingMarkers || [];
  const initialIsTagging: boolean = location.state?.isTagging ?? false;

  const [isTagging, setIsTagging] = useState<boolean>(initialIsTagging);
  const [markers, setMarkers] = useState<TaggingMarkerData[]>(initialMarkers);

  useEffect(() => {
    if (location.state?.newMarker) {
      const newMarker = location.state.newMarker as TaggingMarkerData;

      setMarkers((prev) => {
        if (prev.some((m) => m.id === newMarker.id)) return prev;
        return [...prev, newMarker];
      });

      setIsTagging(true);
      window.history.replaceState({}, document.title);
    } 
    else if (location.state?.markers) {
      setMarkers(location.state.markers);
      setIsTagging(false);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMapRef.current) {
      const map = L.map(mapRef.current, {
        center: [-7.3228, 112.7688],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      leafletMapRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 300);
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const layerGroup = layerGroupRef.current;
    const map = leafletMapRef.current;
    if (!layerGroup || !map) return;

    layerGroup.clearLayers();

    if (markers.length > 0) {
      if (!isTagging && markers.length > 1) {
        const polylineCoords: L.LatLngTuple[] = markers.map((m) => [m.lat, m.lng]);
        const polyline = L.polyline(polylineCoords, {
          color: "#0f172a",
          weight: 3.5,
          opacity: 0.9,
        });
        layerGroup.addLayer(polyline);
      }

      markers.forEach((item, index) => {
        const isFirst = index === 0;
        const isLast = index === markers.length - 1;
        const showBadges = !isTagging;
        const currentType = (item.type || "TIANG").toUpperCase();

        // Render bentuk ikon hitam putih presisi ala Google Earth
        let shapeHtml = '<div class="icon-tiang-geom"></div>';
        if (currentType === "ODP") {
          shapeHtml = '<div class="icon-odp-geom"><div class="inner-dot"></div></div>';
        } else if (currentType === "ODC") {
          shapeHtml = '<div class="icon-odc-geom"></div>';
        } else if (currentType === "HOMEPASS") {
          shapeHtml = '<div class="icon-homepass-geom"><div class="roof"></div><div class="base"></div></div>';
        }

        const pinHtml = `
          <div class="figma-tracking-pin">
            ${showBadges && isFirst ? '<div class="badge-capsule start-capsule">START</div>' : ""}
            ${showBadges && isLast ? '<div class="badge-capsule stop-capsule">STOP</div>' : ""}
            
            <div class="shape-container">
              ${shapeHtml}
            </div>
            
            <div class="label-capsule">
              <span>${item.label || item.type}</span>
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          className: "leaflet-tracking-marker-container",
          html: pinHtml,
          iconSize: [120, 40],
          iconAnchor: [15, 20],
        });

        const marker = L.marker([item.lat, item.lng], { icon: customIcon }).bindPopup(`
          <strong>${item.label || item.type}</strong><br />
          Latitude: ${item.lat.toFixed(6)}<br />
          Longitude: ${item.lng.toFixed(6)}
          ${item.keterangan ? `<br />Ket: ${item.keterangan}` : ""}
        `);

        layerGroup.addLayer(marker);
      });

      const polylineCoords: L.LatLngTuple[] = markers.map((m) => [m.lat, m.lng]);
      const bounds = L.latLngBounds(polylineCoords);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [markers, isTagging]);

  const handleStart = () => {
    setMarkers([]);
    setIsTagging(true);
  };

  const handleStop = () => {
    if (!isTagging) {
      alert("Silakan klik tombol START terlebih dahulu sebelum menyelesaikan tagging!");
      return;
    }

    setIsTagging(false);

    const totalPoints = markers.length;
    const estimatedBytes = Math.max(1024 * 15, totalPoints * 2048);

    const formatFileSize = (bytes: number): string => {
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    navigate("/tagging/save", {
      state: { 
        fileSize: formatFileSize(estimatedBytes),
        markers: markers 
      },
    });
  };

  const handleMenuClick = (path: string) => {
    if (!isTagging) {
      alert("Silakan klik tombol START terlebih dahulu untuk mengaktifkan sesi tagging!");
      return;
    }

    navigate(path, {
      state: {
        existingMarkers: markers,
        isTagging: true,
      },
    });
  };

  return (
    <MainLayout pageTitle="Tagging Map" activeMenu="tagging">
      <div className="tagging-page">
        <section className="tagging-map-section">
          <div ref={mapRef} className="tagging-real-map" />

          {isTagging && (
            <div className="tagging-status">
              <span className="status-dot"></span>
              Tagging aktif — pilih menu di bawah untuk menginput data
            </div>
          )}
        </section>

        <div className="tagging-controls">
          <button
            type="button"
            className={`tagging-button start-button ${isTagging ? "button-active" : ""}`}
            onClick={handleStart}
          >
            <span className="button-icon">▶</span>
            START
          </button>

          <button
            type="button"
            className={`tagging-button stop-button ${!isTagging ? "button-disabled" : ""}`}
            onClick={handleStop}
            disabled={!isTagging}
            style={{
              opacity: isTagging ? 1 : 0.5,
              cursor: isTagging ? "pointer" : "not-allowed"
            }}
          >
            <span className="button-icon stop-icon">□</span>
            STOP
          </button>
        </div>

        <section className="tagging-legend">
          <div className="legend-card" onClick={() => handleMenuClick("/tagging/odp")}>
            <div className="legend-icon odp-icon">
              <div className="icon-odp-geom" style={{ transform: "scale(0.9)" }}>
                <div className="inner-dot"></div>
              </div>
            </div>
            <div className="legend-text"><strong>ODP</strong></div>
          </div>
          <div className="legend-card" onClick={() => handleMenuClick("/tagging/odc")}>
            <div className="legend-icon odc-icon">
              <div className="icon-odc-geom" style={{ transform: "scale(0.7)" }}></div>
            </div>
            <div className="legend-text"><strong>ODC</strong></div>
          </div>
          <div className="legend-card" onClick={() => handleMenuClick("/tagging/tiang")}>
            <div className="legend-icon tiang-icon">
              <div className="icon-tiang-geom" style={{ transform: "scale(0.9)" }}></div>
            </div>
            <div className="legend-text"><strong>TIANG</strong></div>
          </div>
          <div className="legend-card" onClick={() => handleMenuClick("/tagging/homepass")}>
            <div className="legend-icon homepass-icon">
              <div className="icon-homepass-geom" style={{ transform: "scale(0.8)" }}>
                <div className="roof"></div>
                <div className="base"></div>
              </div>
            </div>
            <div className="legend-text"><strong>HOMEPASS</strong></div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
};

export default TaggingMaps;