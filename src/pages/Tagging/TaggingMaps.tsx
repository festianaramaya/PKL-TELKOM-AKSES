import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MainLayout from "../../components/MainLayout";
import "../../assets/Tagging/TaggingMaps.css";

const TaggingMaps: React.FC = () => {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  const [isTagging, setIsTagging] = useState(false);

  // Koordinat awal Rungkut, Surabaya
  const center: L.LatLngExpression = [-7.3228, 112.7688];

  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletMapRef.current) return;

    // BUAT LEAFLET MAP
    const map = L.map(mapRef.current, {
      center,
      zoom: 14,
      zoomControl: true,
    });

    leafletMapRef.current = map;

    // OPEN STREET MAP TILE
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }
    ).addTo(map);

    // ICON MARKER
    const odpIcon = L.divIcon({
      className: "custom-map-marker",
      html: `
        <div class="map-marker odp-marker">
          <span>ODP</span>
        </div>
      `,
      iconSize: [50, 50],
      iconAnchor: [25, 25],
    });

    // EVENT KLIK UNTUK TAGGING
    map.on("click", (event: L.LeafletMouseEvent) => {
      if (!isTagging) return;

      const { lat, lng } = event.latlng;

      L.marker([lat, lng], { icon: odpIcon })
        .addTo(map)
        .bindPopup(`
          <strong>Tagging Point</strong><br />
          Latitude: ${lat.toFixed(6)}<br />
          Longitude: ${lng.toFixed(6)}
        `)
        .openPopup();
    });

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      leafletMapRef.current = null;
    };
  }, [isTagging]);

  const handleStart = () => {
    setIsTagging(true);
    if (leafletMapRef.current) {
      leafletMapRef.current.getContainer().style.cursor = "crosshair";
    }
  };

  // ==========================================
  // REVISI BAGIAN STOP
  // ==========================================
  const handleStop = () => {
    setIsTagging(false);
    if (leafletMapRef.current) {
      leafletMapRef.current.getContainer().style.cursor = "";
    }
    // Langsung navigasi ke halaman input simpan hasil tagging (.kml)
    navigate("/tagging/keterangan");
  };

  return (
    <MainLayout pageTitle="Tagging Map" activeMenu="tagging">
      <div className="tagging-page">
        {/* MAP SECTION */}
        <section className="tagging-map-section">
          <div ref={mapRef} className="tagging-real-map" />

          {isTagging && (
            <div className="tagging-status">
              <span className="status-dot"></span>
              Tagging aktif — klik lokasi pada peta
            </div>
          )}
        </section>

        {/* CONTROLS */}
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
            className="tagging-button stop-button"
            onClick={handleStop}
          >
            <span className="button-icon stop-icon">□</span>
            STOP
          </button>
        </div>

        {/* MENU LEGEND / NAVIGATION CARDS */}
        <section className="tagging-legend">
          <div
            className="legend-card"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/tagging/odp")}
          >
            <div className="legend-icon odp-icon">
              <span>◉</span>
            </div>
            <div className="legend-text">
              <strong>ODP</strong>
              <small>Optical Distribution Point</small>
            </div>
          </div>

          <div
            className="legend-card"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/tagging/odc")}
          >
            <div className="legend-icon odc-icon">
              <span>▥</span>
            </div>
            <div className="legend-text">
              <strong>ODC</strong>
              <small>Optical Distribution Cabinet</small>
            </div>
          </div>

          <div
            className="legend-card"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/tagging/tiang")}
          >
            <div className="legend-icon tiang-icon">
              <span>◎</span>
            </div>
            <div className="legend-text">
              <strong>TIANG</strong>
              <small>Tiang Infrastruktur</small>
            </div>
          </div>

          <div
            className="legend-card"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/tagging/homepass")}
          >
            <div className="legend-icon homepass-icon">
              <span>⌂</span>
            </div>
            <div className="legend-text">
              <strong>HOMEPASS</strong>
              <small>Homepass Pelanggan</small>
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
};

export default TaggingMaps;