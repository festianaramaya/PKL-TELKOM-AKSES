import React, { useState, useRef } from 'react';
import MainLayout from '../components/MainLayout';
import '../assets/TaggingMaps.css';

const TaggingMaps: React.FC = () => {
  return (
    <div className="tagging-page">
      {/* MAP AREA */}
      <div className="tagging-map-container">

        {/* Background / Map */}
        <img
          className="tagging-background-map"
          src="/images/map-maker-rungkut-surabaya-east-java-indonesia-standard0.png"
          alt="Map Rungkut Surabaya"
        />

        {/* START */}
        <button className="tagging-start">
          START
        </button>

        {/* STOP */}
        <button className="tagging-stop">
          STOP
        </button>

        {/* Polygon */}
        <img
          className="tagging-polygon"
          src="/images/polygon-60.svg"
          alt="Polygon"
        />

        {/* MAP LEGEND */}
        <div className="tagging-legend">

          <div className="legend-item">
            <div className="legend-box"></div>
            <span>ODP</span>
          </div>

          <div className="legend-item">
            <div className="legend-box"></div>
            <span>ODC</span>
          </div>

          <div className="legend-item">
            <div className="legend-box"></div>
            <span>TIANG</span>
          </div>

          <div className="legend-item">
            <div className="legend-box"></div>
            <span>HOMEPASS</span>
          </div>

        </div>

        {/* Marker images */}
        <img
          className="tagging-image-25"
          src="/images/image-250.png"
          alt="ODP Marker"
        />

        <img
          className="tagging-image-26"
          src="/images/image-260.png"
          alt="ODC Marker"
        />

        <img
          className="tagging-image-28"
          src="/images/image-280.png"
          alt="Homepass Marker"
        />

        <img
          className="tagging-image-30"
          src="/images/image-300.png"
          alt="Map Marker"
        />

      </div>
    </div>
  );
};

export default TaggingMaps;