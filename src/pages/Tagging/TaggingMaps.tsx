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

        let imgName = "tiang.png";
        if (currentType === "ODP") imgName = "odp.png";
        else if (currentType === "ODC") imgName = "odc.png";
        else if (currentType === "HOMEPASS") imgName = "homepass.png";

        const shapeHtml = `<img src="${import.meta.env.BASE_URL}images/${imgName}" alt="${currentType}" class="marker-img-icon monochrome-icon" />`;

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

        {/* MENU NAVIGASI GRID SEJAJAR 4 */}
        <section className="tagging-grid-container">
          {/* ODP */}
          <div className="grid-menu-item" onClick={() => handleMenuClick("/tagging/odp")}>
            <div className="outer-circle">
              <div className="inner-square">
                <img
                  src={`${import.meta.env.BASE_URL}images/odp.png`}
                  alt="ODP"
                  className="menu-icon-img black-icon"
                />
              </div>
            </div>
            <div className="group-95-ot-frame-group87-gi">
              <div className="group-95-ot-text-odp-cz1">
                <p className="group-95-ot-text-odp-cz2">ODP</p>
              </div>
            </div>
          </div>

          {/* ODC */}
          <div className="grid-menu-item" onClick={() => handleMenuClick("/tagging/odc")}>
            <div className="outer-circle">
              <div className="inner-square">
                <img
                  src={`${import.meta.env.BASE_URL}images/odc.png`}
                  alt="ODC"
                  className="menu-icon-img black-icon"
                />
              </div>
            </div>
            <div className="group-95-ot-frame-group874w">
              <div className="group-95-ot-text-odc-tv1">
                <p className="group-95-ot-text-odc-tv2">ODC</p>
              </div>
            </div>
          </div>

          {/* TIANG */}
          <div className="grid-menu-item" onClick={() => handleMenuClick("/tagging/tiang")}>
            <div className="outer-circle">
              <div className="inner-square">
                <img
                  src={`${import.meta.env.BASE_URL}images/tiang.png`}
                  alt="TIANG"
                  className="menu-icon-img black-icon"
                />
              </div>
            </div>
            <div className="group-95-ot-frame-group87-vb">
              <div className="group-95-ot-text-tiang6c1">
                <p className="group-95-ot-text-tiang6c2">TIANG</p>
              </div>
            </div>
          </div>

          {/* HOMEPASS */}
          <div className="grid-menu-item" onClick={() => handleMenuClick("/tagging/homepass")}>
            <div className="outer-circle">
              <div className="inner-square">
                <img
                  src={`${import.meta.env.BASE_URL}images/homepass.png`}
                  alt="HOMEPASS"
                  className="menu-icon-img black-icon"
                />
              </div>
            </div>
            <div className="group-95-ot-frame-group877i">
              <div className="group-95-ot-text-homepass-wh1">
                <p className="group-95-ot-text-homepass-wh2">HOMEPASS</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
};

export default TaggingMaps;