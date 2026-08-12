import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MainLayout from "../components/MainLayout";
import "../assets/TaggingMaps.css";

const TaggingMaps: React.FC = () => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  const [isTagging, setIsTagging] = useState(false);

  // Koordinat Rungkut, Surabaya
  const center: L.LatLngExpression = [-7.3228, 112.7688];

  useEffect(() => {
    if (!mapRef.current) return;

    // Jangan membuat map dua kali
    if (leafletMapRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom: 14,
      zoomControl: true,
    });

    leafletMapRef.current = map;

    // ==============================
    // OPENSTREETMAP
    // ==============================
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }
    ).addTo(map);

    // ==============================
    // MARKER CONTOH
    // ==============================

    // ODP
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

    // ODC
    const odcIcon = L.divIcon({
      className: "custom-map-marker",
      html: `
        <div class="map-marker odc-marker">
          <span>ODC</span>
        </div>
      `,
      iconSize: [50, 50],
      iconAnchor: [25, 25],
    });

    // TIANG
    const tiangIcon = L.divIcon({
      className: "custom-map-marker",
      html: `
        <div class="map-marker tiang-marker">
          <span>TIANG</span>
        </div>
      `,
      iconSize: [55, 55],
      iconAnchor: [27, 27],
    });

    // HOMEPASS
    const homepassIcon = L.divIcon({
      className: "custom-map-marker",
      html: `
        <div class="map-marker homepass-marker">
          <span>HOME</span>
        </div>
      `,
      iconSize: [55, 55],
      iconAnchor: [27, 27],
    });

    L.marker([-7.3205, 112.7665], {
      icon: odpIcon,
    })
      .addTo(map)
      .bindPopup("<b>ODP</b><br>ODP Rungkut");

    L.marker([-7.3242, 112.7712], {
      icon: odcIcon,
    })
      .addTo(map)
      .bindPopup("<b>ODC</b><br>ODC Rungkut");

    L.marker([-7.3198, 112.7745], {
      icon: tiangIcon,
    })
      .addTo(map)
      .bindPopup("<b>TIANG</b><br>Tiang Telekomunikasi");

    L.marker([-7.3265, 112.7652], {
      icon: homepassIcon,
    })
      .addTo(map)
      .bindPopup("<b>HOMEPASS</b><br>Homepass");

    // ==============================
    // CLEANUP
    // ==============================

    setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  // ==============================
  // START TAGGING
  // ==============================

  const handleStart = () => {
    setIsTagging(true);

    if (leafletMapRef.current) {
      leafletMapRef.current.getContainer().style.cursor = "crosshair";
    }
  };

  // ==============================
  // STOP TAGGING
  // ==============================

  const handleStop = () => {
    setIsTagging(false);

    if (leafletMapRef.current) {
      leafletMapRef.current.getContainer().style.cursor = "";
    }
  };

  return (
    <MainLayout
      pageTitle="Tagging Map"
      activeMenu="tagging"
    >
      <div className="tagging-page">

        {/* =========================
            MAP CONTAINER
        ========================== */}

        <section className="tagging-map-section">

          <div
            ref={mapRef}
            className="tagging-real-map"
          />

          {/* STATUS */}
          {isTagging && (
            <div className="tagging-status">
              <span className="status-dot"></span>
              Tagging aktif
            </div>
          )}

        </section>

        {/* =========================
            BUTTON AREA
        ========================== */}

        <div className="tagging-controls">

          <button
            type="button"
            className={`tagging-button start-button ${
              isTagging ? "button-active" : ""
            }`}
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

        {/* =========================
            LEGEND
        ========================== */}

        <section className="tagging-legend">

          <div className="legend-card">
            <div className="legend-icon odp-icon">
              <span>◉</span>
            </div>

            <div className="legend-text">
              <strong>ODP</strong>
              <small>Optical Distribution Point</small>
            </div>
          </div>

          <div className="legend-card">
            <div className="legend-icon odc-icon">
              <span>▥</span>
            </div>

            <div className="legend-text">
              <strong>ODC</strong>
              <small>Optical Distribution Cabinet</small>
            </div>
          </div>

          <div className="legend-card">
            <div className="legend-icon tiang-icon">
              <span>◎</span>
            </div>

            <div className="legend-text">
              <strong>TIANG</strong>
              <small>Tiang Infrastruktur</small>
            </div>
          </div>

          <div className="legend-card">
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