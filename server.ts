import sqlite3 from "sqlite3";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { XMLParser } from "fast-xml-parser";
import Drawing from "dxf-writer";
import { createObjectCsvStringifier } from "csv-writer";
import { parse as parseCsvSync } from "csv-parse/sync";
import fs from "fs";
import * as turf from "@turf/turf";
// @ts-ignore - polygon-clipping mengekspor default berupa objek berisi fungsi union/intersect/dll
import polygonClipping from "polygon-clipping";
import { createRequire } from "module";
import * as XLSX from "xlsx";

const requireArchiver = createRequire(import.meta.url);
// PERBAIKAN: archiver v8 (breaking change) menghapus API lama `archiver('zip', opts)`.
// Sekarang wajib pakai named export class: `new ZipArchive(opts)`.
const { ZipArchive } = requireArchiver("archiver");
const AdmZip = requireArchiver("adm-zip");
const xmldom = requireArchiver("@xmldom/xmldom");
const KMLDOMParser = xmldom.DOMParser;
const KMLXMLSerializer = xmldom.XMLSerializer;

const upload = multer({ dest: "uploads/" });
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ============================================================
// === INTERFACES & HELPER UNTUK POINT IN POLYGON ===
// ============================================================
interface PointData {
  name: string;
  lat: number;
  lon: number;
}

interface PolygonData {
  name: string;
  coords: [number, number][];
}

function pointInPolygon(point: PointData, polygon: [number, number][]): boolean {
  const x = point.lon;
  const y = point.lat;
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
        
    if (intersect) inside = !inside;
  }
  return inside;
}

function parseKMLPoints(xmlString: string): PointData[] {
  const doc = new KMLDOMParser().parseFromString(xmlString, 'text/xml');
  const placemarks = doc.getElementsByTagName('Placemark');
  const points: PointData[] = [];
  for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      const pointNode = pm.getElementsByTagName('Point')[0];
      if (pointNode) {
          const nameNode = pm.getElementsByTagName('name')[0];
          const name = nameNode && nameNode.textContent ? nameNode.textContent.trim() : 'Unnamed Point';
          const coordsNode = pointNode.getElementsByTagName('coordinates')[0];
          if (coordsNode && coordsNode.textContent) {
              const parts = coordsNode.textContent.trim().split(',');
              if (parts.length >= 2) {
                  points.push({ name, lat: parseFloat(parts[1]), lon: parseFloat(parts[0]) });
              }
          }
      }
  }
  return points;
}

function parseKMLPolygons(xmlString: string): PolygonData[] {
  const doc = new KMLDOMParser().parseFromString(xmlString, 'text/xml');
  const placemarks = doc.getElementsByTagName('Placemark');
  const polygons: PolygonData[] = [];
  for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      const polyNode = pm.getElementsByTagName('Polygon')[0];
      if (polyNode) {
          const nameNode = pm.getElementsByTagName('name')[0];
          const name = nameNode && nameNode.textContent ? nameNode.textContent.trim() : 'Unnamed Polygon';
          const coordsNode = polyNode.getElementsByTagName('coordinates')[0];
          if (coordsNode && coordsNode.textContent) {
              const pairs = coordsNode.textContent.trim().split(/\s+/);
              const polygonCoords: [number, number][] = [];
              for (const pair of pairs) {
                  if (pair.length > 0) {
                      const parts = pair.split(',');
                      if (parts.length >= 2) {
                          polygonCoords.push([parseFloat(parts[0]), parseFloat(parts[1])]);
                      }
                  }
              }
              if (polygonCoords.length > 0) {
                  polygons.push({ name, coords: polygonCoords });
              }
          }
      }
  }
  return polygons;
}

// ============================================================
// === INTERFACES & HELPER UNTUK POLYGON IN POLYGON MAPPING ===
// ============================================================
interface PipCoordinate {
  lng: number;
  lat: number;
}

interface PipPolygonData {
  name: string;
  description: string;
  coordinates: PipCoordinate[];
}

interface PipProcessResult {
  results: Record<string, any>[];
  dynamic_columns: string[];
}

function pipCleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/<[^>]*>?/gm, '').trim();
}

function pipParsePolygonCoordinates(coordString: string): PipCoordinate[] {
  const coordinates: PipCoordinate[] = [];
  const points = coordString.trim().split(/\s+/);
  
  for (const point of points) {
    if (point) {
      const coords = point.split(',');
      if (coords.length >= 2) {
        coordinates.push({
          lng: parseFloat(coords[0].trim()),
          lat: parseFloat(coords[1].trim())
        });
      }
    }
  }
  return coordinates;
}

function pipParsePolygonsFromKML(kmlContent: string): PipPolygonData[] {
  const polygons: PipPolygonData[] = [];
  const parser = new KMLDOMParser();
  const doc = parser.parseFromString(kmlContent, 'text/xml');
  
  const placemarks = doc.getElementsByTagName('Placemark');
  
  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];
    const polygonData: PipPolygonData = { name: '', description: '', coordinates: [] };
    
    const nameNode = placemark.getElementsByTagName('name')[0];
    if (nameNode && nameNode.textContent) polygonData.name = pipCleanText(nameNode.textContent);
    
    const descNode = placemark.getElementsByTagName('description')[0];
    if (descNode && descNode.textContent) polygonData.description = descNode.textContent;
    
    let coordsText = '';
    const linearRing = placemark.getElementsByTagName('LinearRing')[0];
    if (linearRing) {
      const coordsNode = linearRing.getElementsByTagName('coordinates')[0];
      if (coordsNode && coordsNode.textContent) coordsText = coordsNode.textContent;
    }
    
    if (!coordsText) {
      const coordsNode = placemark.getElementsByTagName('coordinates')[0];
      if (coordsNode && coordsNode.textContent) coordsText = coordsNode.textContent;
    }
    
    if (coordsText) polygonData.coordinates = pipParsePolygonCoordinates(coordsText);
    if (polygonData.coordinates.length > 0) polygons.push(polygonData);
  }
  return polygons;
}

function pipCalculatePolyCentroid(coordinates: PipCoordinate[]): PipCoordinate {
  let x = 0; let y = 0;
  const count = coordinates.length;
  for (const coord of coordinates) { x += coord.lng; y += coord.lat; }
  return { lng: x / count, lat: y / count };
}

function pipIsPointInPoly(point: PipCoordinate, polygon: PipCoordinate[]): boolean {
  const x = point.lng; const y = point.lat;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pipIsPolygonInsideBigPolygon(smallPolygon: PipPolygonData, bigPolygon: PipPolygonData): boolean {
  if (smallPolygon.coordinates.length === 0 || bigPolygon.coordinates.length === 0) return false;
  const centroid = pipCalculatePolyCentroid(smallPolygon.coordinates);
  return pipIsPointInPoly(centroid, bigPolygon.coordinates);
}

function pipExtractDataFromDescription(description: string): Record<string, string> {
  const data: Record<string, string> = {};
  if (!description) return data;

  if (description.includes('<table') || description.includes('<tr')) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(description)) !== null) {
      const rowContent = trMatch[1];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let tdMatch;
      while ((tdMatch = tdRegex.exec(rowContent)) !== null) cells.push(pipCleanText(tdMatch[1]));
      if (cells.length >= 2 && cells[0]) data[cells[0]] = cells[1];
    }
  }

  if (Object.keys(data).length === 0) {
    const lines = description.split(/\r\n|\r|\n/);
    for (const line of lines) {
      if (line.includes(':')) {
        const parts = line.split(':');
        const key = pipCleanText(parts[0]);
        const value = pipCleanText(parts.slice(1).join(':'));
        if (key) data[key] = value;
      }
    }
  }
  return data;
}

function pipProcessKMLMapping(smallKMLContent: string, bigKMLContent: string): PipProcessResult {
  const smallPolygons = pipParsePolygonsFromKML(smallKMLContent);
  const bigPolygons = pipParsePolygonsFromKML(bigKMLContent);
  
  const allDescriptionKeys = new Set<string>();
  const results: Record<string, any>[] = [];
  
  for (const small of smallPolygons) {
    const descData = pipExtractDataFromDescription(small.description);
    Object.keys(descData).forEach(key => allDescriptionKeys.add(key));
  }
  
  const dynamicColumns = Array.from(allDescriptionKeys);

  for (const small of smallPolygons) {
    const resultRow: Record<string, any> = {
      nama_polygon_kecil: small.name,
      nama_polygon_besar: 'Polygon Tidak Ditemukan'
    };
    
    const descData = pipExtractDataFromDescription(small.description);
    for (const key of dynamicColumns) resultRow[key] = descData[key] || '';
    
    for (const big of bigPolygons) {
      if (pipIsPolygonInsideBigPolygon(small, big)) {
        resultRow.nama_polygon_besar = big.name;
        break;
      }
    }
    results.push(resultRow);
  }
  return { results, dynamic_columns: dynamicColumns };
}


// ============================================================
// === INTERFACES & HELPER UNTUK RENAME PLACEMARKS ===
// ============================================================
interface RenameOptions {
  labelType: 'numeric' | 'custom';
  prefix: string;
  startNumber: number;
  numbering: 'sequential' | 'random';
  customName: string;
}

function sanitizeFileNameCustom(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9_.()-]/g, '_');
}

function renamePlacemarks(doc: any, options: RenameOptions): any {
  const placemarks = doc.getElementsByTagName('Placemark');
  const totalPlacemarks = placemarks.length;

  let counter = options.startNumber;
  let numbers: number[] = [];

  if (options.labelType === 'numeric' && options.numbering === 'random') {
    for (let i = 0; i < totalPlacemarks; i++) {
      numbers.push(counter + i);
    }
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
  }

  for (let i = 0; i < totalPlacemarks; i++) {
    const pm = placemarks[i];

    const descriptions = pm.getElementsByTagName('description');
    while (descriptions.length > 0) {
      pm.removeChild(descriptions[0]);
    }

    let newName = '';
    if (options.labelType === 'numeric') {
      const num = options.numbering === 'sequential' ? (counter + i) : numbers[i];
      const paddedNum = num.toString().padStart(3, '0');
      newName = `${options.prefix}${paddedNum}`; 
    } else {
      newName = options.customName.replace('{n}', (counter + i).toString());
    }

    const nameNodes = pm.getElementsByTagName('name');
    if (nameNodes.length > 0) {
      const nameNode = nameNodes[0];
      while (nameNode.firstChild) {
        nameNode.removeChild(nameNode.firstChild);
      }
      nameNode.appendChild(doc.createTextNode(newName));
    } else {
      const nameElem = doc.createElement('name');
      nameElem.appendChild(doc.createTextNode(newName));
      if (pm.firstChild) {
        pm.insertBefore(nameElem, pm.firstChild);
      } else {
        pm.appendChild(nameElem);
      }
    }
  }

  return doc;
}
// ============================================================


// ============================================================
// === HELPER & CONSTANTS UMUM ===
// ============================================================
const AVAILABLE_ICONS: Record<string, string> = {
  'U': 'https://maps.google.com/mapfiles/kml/paddle/U.png',
  'L': 'https://maps.google.com/mapfiles/kml/paddle/L.png',
  'Yellow Circle': 'https://maps.google.com/mapfiles/kml/paddle/ylw-circle.png',
  'Red Circle': 'https://maps.google.com/mapfiles/kml/paddle/red-circle.png',
  'Blue Circle': 'https://maps.google.com/mapfiles/kml/paddle/blu-circle.png',
  'Green Circle': 'https://maps.google.com/mapfiles/kml/paddle/grn-circle.png',
  'Pink Circle': 'https://maps.google.com/mapfiles/kml/paddle/pink-circle.png',
  'White Circle': 'https://maps.google.com/mapfiles/kml/paddle/wht-circle.png',
  'Circle Dot': 'https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png',
  'Flag': 'https://maps.google.com/mapfiles/kml/shapes/flag.png',
  'Home': 'https://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png'
};

function safePath(name: string): string {
  const sanitized = name.replace(/[/\\:*?"<>|]/g, '-').trim().replace(/[. ]+$/, '');
  return sanitized === '' ? '_' : sanitized.substring(0, 100);
}

// Deteksi Delimiter CSV
function detectCsvDelimiter(csvText: string): string {
  const firstLine = csvText.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;

  for (const delimiter of candidates) {
    const escaped = delimiter === "\t" ? "\t" : `\\${delimiter}`;
    const count = delimiter === "\t"
      ? (firstLine.match(/\t/g) || []).length
      : (firstLine.match(new RegExp(escaped, "g")) || []).length;
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }

  return best;
}

// -------------------------------------------------------------------------
// REVOLUSI: PARSER KOORDINAT PINTAR (MENYEMBUHKAN FORMAT EXCEL YANG HANCUR)
// -------------------------------------------------------------------------
function parseFloatVal(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  
  const numDots = (s.match(/\./g) || []).length;
  const numCommas = (s.match(/,/g) || []).length;
  
  // Jika formatnya sudah normal (Maksimal 1 titik, tanpa koma)
  if (numDots <= 1 && numCommas === 0) {
      const num = parseFloat(s);
      return isNaN(num) ? null : num;
  }
  
  // Jika menggunakan koma sebagai desimal (Format Indonesia standar tanpa ribuan)
  if (numCommas === 1 && numDots === 0) {
      const num = parseFloat(s.replace(',', '.'));
      return isNaN(num) ? null : num;
  }
  
  // Jika format ribuan standar (e.g. 1,234.56 atau 1.234,56)
  if (numDots === 1 && numCommas === 1) {
     if (s.indexOf('.') > s.indexOf(',')) {
        return parseFloat(s.replace(/,/g, '')); // 1,234.56
     } else {
        return parseFloat(s.replace(/\./g, '').replace(',', '.')); // 1.234,56
     }
  }
  
  // =======================================================================
  // JIKA FORMATNYA HANCUR OLEH EXCEL (Contoh: "-724.615.390.450.803" atau "1.126.178...")
  // =======================================================================
  let sign = s.startsWith('-') ? '-' : '';
  let digitsOnly = s.replace(/[^0-9]/g, '');
  
  if (!digitsOnly) return null;
  
  // Ambil beberapa digit pertama untuk mendeteksi apakah ini Bujur atau Lintang Indonesia
  let p3 = parseInt(digitsOnly.substring(0, 3) || '0', 10);
  let p2 = parseInt(digitsOnly.substring(0, 2) || '0', 10);
  
  let decimalIndex = 1; // Default: Taruh titik setelah 1 angka pertama (Contoh: 7.24615)
  
  // Logika Khusus Wilayah Indonesia (Bujur 95-141, Lintang -11 sd 6)
  if (p3 >= 95 && p3 <= 141) {
      // Area Bujur Indonesia (95 sampai 141)
      decimalIndex = 3; // Menjadi e.g. 112.617...
  } else if (p2 >= 95 && p2 <= 99) {
      // Area Bujur Indonesia Bagian Barat (95 sampai 99)
      decimalIndex = 2; // Menjadi e.g. 95.345...
  } else if (p2 >= 10 && p2 <= 11) {
      // Area Lintang Selatan (-10 sampai -11)
      decimalIndex = 2; // Menjadi e.g. -10.567...
  }
  // Sisa angka seperti '7246' akan tetap masuk ke decimalIndex = 1 menjadi 7.246.
  
  // Susun ulang digitnya menjadi float yang benar
  let fixedStr = sign + digitsOnly.substring(0, decimalIndex) + '.' + digitsOnly.substring(decimalIndex);
  
  const result = parseFloat(fixedStr);
  return isNaN(result) ? null : result;
}

function calculateCentroid(coordinatesStr: string): { lat: number; lon: number } | null {
  const cleanCoords = coordinatesStr.trim().replace(/\s+/g, ' ');
  const points = cleanCoords.split(' ');
  
  let latSum = 0;
  let lonSum = 0;
  let count = 0;
  
  for (const point of points) {
    if (!point) continue;
    const parts = point.split(',');
    if (parts.length < 2) continue;
    
    lonSum += parseFloat(parts[0]);
    latSum += parseFloat(parts[1]);
    count++;
  }
  
  return count > 0 ? { lat: latSum / count, lon: lonSum / count } : null;
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseWktToKml(wktRaw: string): string {
  const wkt = String(wktRaw).trim().toUpperCase();
  if (!wkt) return '';

  const toKmlCoords = (coordsStr: string): string => {
    // 1. Amankan pemisah antar-titik 
    let str = coordsStr.replace(/,\s+/g, '|');
    // 2. Jika ada koma tersisa (karena wkt dari excel), jangan diganggu dulu biar ditangani parseFloatVal
    str = str.replace(/\|/g, ',');

    return str.split(',').map(pair => {
      const parts = pair.trim().split(/\s+/);
      if (parts.length >= 2) {
        
        // Gunakan parser pintar yang baru kita buat
        let lon = parseFloatVal(parts[0]);
        let lat = parseFloatVal(parts[1]);

        if (lon !== null && lat !== null) {
            // AUTO-SWAP: Deteksi otomatis jika Latitude dan Longitude terbalik
            if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
              const temp = lon;
              lon = lat;
              lat = temp;
            }
            return `${lon},${lat},0`;
        }
      }
      return null;
    }).filter(Boolean).join(' ');
  };

  if (wkt.startsWith('POINT')) {
    const coordsMatch = wkt.match(/\((.*?)\)/);
    if (coordsMatch) {
      const coords = toKmlCoords(coordsMatch[1]);
      if (coords) return `\n<styleUrl>#pointStyle</styleUrl>\n<Point><coordinates>${coords}</coordinates></Point>`;
    }
  }

  if (wkt.startsWith('LINESTRING')) {
    const coordsMatch = wkt.match(/\((.*?)\)/);
    if (coordsMatch) {
      const coords = toKmlCoords(coordsMatch[1]);
      if (coords) return `\n<styleUrl>#lineStyle</styleUrl>\n<LineString><coordinates>${coords}</coordinates></LineString>`;
    }
  }

  if (wkt.startsWith('POLYGON')) {
    const rings = wkt.match(/\([^()]+\)/g);
    if (rings && rings.length > 0) {
      let polyKml = `\n<styleUrl>#polygonStyle</styleUrl>\n<Polygon>`;
      let validRings = 0;
      rings.forEach((ring, index) => {
        const cleanRing = ring.replace(/[()]/g, '');
        const boundaryTag = index === 0 ? 'outerBoundaryIs' : 'innerBoundaryIs';
        const coords = toKmlCoords(cleanRing);
        if (coords) {
            let kmlCoordArr = coords.split(' ');
            if (kmlCoordArr.length >= 3) {
                if (kmlCoordArr[0] !== kmlCoordArr[kmlCoordArr.length - 1]) {
                    kmlCoordArr.push(kmlCoordArr[0]); 
                }
                polyKml += `\n<${boundaryTag}><LinearRing><coordinates>${kmlCoordArr.join(' ')}</coordinates></LinearRing></${boundaryTag}>`;
                validRings++;
            }
        }
      });
      polyKml += `\n</Polygon>`;
      return validRings > 0 ? polyKml : '';
    }
  }

  if (wkt.startsWith('MULTIPOLYGON')) {
    const polyBlocks = wkt.match(/\(\s*\((.*?)\s*\)\s*\)/g) || wkt.match(/\(\s*\(\s*\((.*?)\s*\)\s*\)\s*\)/g);
    if (polyBlocks && polyBlocks.length > 0) {
        let multiKml = `\n<styleUrl>#polygonStyle</styleUrl>\n<MultiGeometry>`;
        let valid = 0;
        polyBlocks.forEach(block => {
            const innerPoly = parseWktToKml(`POLYGON ${block}`);
            if (innerPoly) {
                multiKml += '\n' + innerPoly.replace(/<styleUrl>.*?<\/styleUrl>/, '');
                valid++;
            }
        });
        multiKml += `\n</MultiGeometry>`;
        return valid > 0 ? multiKml : '';
    }
  }

  if (wkt.startsWith('MULTIPOINT')) {
    const coords = toKmlCoords(wkt.replace(/[A-Z()\s]/g, ' '));
    if (coords) {
      let multiKml = `\n<styleUrl>#pointStyle</styleUrl>\n<MultiGeometry>`;
      coords.split(' ').forEach(c => {
         multiKml += `\n<Point><coordinates>${c}</coordinates></Point>`;
      });
      multiKml += `\n</MultiGeometry>`;
      return multiKml;
    }
  }

  if (wkt.startsWith('MULTILINESTRING')) {
    const lines = wkt.match(/\([^()]+\)/g);
    if (lines && lines.length > 0) {
        let multiKml = `\n<styleUrl>#lineStyle</styleUrl>\n<MultiGeometry>`;
        let valid = 0;
        lines.forEach(line => {
            const coords = toKmlCoords(line.replace(/[()]/g, ''));
            if (coords) {
                multiKml += `\n<LineString><coordinates>${coords}</coordinates></LineString>`;
                valid++;
            }
        });
        multiKml += `\n</MultiGeometry>`;
        return valid > 0 ? multiKml : '';
    }
  }

  return '';
}
// ============================================================

const _require = createRequire(import.meta.url);
// @ts-ignore 
const PolylineEntity = _require("dxf-writer/src/Polyline.js");
const _originalPolylineTags = PolylineEntity.prototype.tags;
PolylineEntity.prototype.tags = function (manager: any) {
  const layer = (this as any).layer;
  const usesDashedLinetype =
    !!layer && !!layer.lineTypeName && layer.lineTypeName.toUpperCase() !== "CONTINUOUS";

  if (!usesDashedLinetype) {
    return _originalPolylineTags.call(this, manager);
  }

  const originalPush = manager.push.bind(manager);
  manager.push = (code: number, value: any) => {
    if (code === 70) {
      value = (typeof value === "number" ? value : 0) | 128;
    }
    return originalPush(code, value);
  };
  try {
    _originalPolylineTags.call(this, manager);
  } finally {
    manager.push = originalPush;
  }
};

const KML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false, 
};

const getPlacemarkName = (p: any): string => {
  if (p == null || p.name === undefined || p.name === null) return "Unnamed";
  const s = String(p.name).trim();
  return s === "" ? "Unnamed" : s;
};

const sanitizeDxfText = (raw: string): string => {
  return String(raw ?? "")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const toRad = (deg: number): number => (deg * Math.PI) / 180;

const rotateOffset = (dx: number, dy: number, deg: number): { x: number; y: number } => {
  const rad = toRad(deg);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
};

type GeomEntry = { kind: "Point" | "LineString" | "Polygon"; coordinates: string };

const collectGeometries = (node: any, acc: GeomEntry[] = []): GeomEntry[] => {
  if (!node) return acc;

  const pushAll = (kind: GeomEntry["kind"], val: any, getCoords: (g: any) => string | undefined) => {
    const arr = Array.isArray(val) ? val : [val];
    arr.forEach((g) => {
      const coords = getCoords(g);
      if (coords) acc.push({ kind, coordinates: coords });
    });
  };

  if (node.Point) pushAll("Point", node.Point, (g) => g?.coordinates);
  if (node.LineString) pushAll("LineString", node.LineString, (g) => g?.coordinates);
  if (node.Polygon) pushAll("Polygon", node.Polygon, (g) => g?.outerBoundaryIs?.LinearRing?.coordinates);

  if (node.MultiGeometry) {
    const mg = Array.isArray(node.MultiGeometry) ? node.MultiGeometry : [node.MultiGeometry];
    mg.forEach((m: any) => collectGeometries(m, acc));
  }

  return acc;
};

type PlacemarkCategory =
  | "boundary_cluster"
  | "fat_boundary"
  | "homepass_cover"
  | "homepass_uncover"
  | "homepass"
  | "fat"
  | "fdt"
  | "existing_pole"
  | "new_pole"
  | "joint_closure"
  | "slack_hanger"
  | "sling_wire"
  | "cable"
  | "cable_subfeeder"
  | "boundary_area"
  | "";

const detectCategory = (folderName: string): PlacemarkCategory | null => {
  const n = folderName.toUpperCase();
  if (/BOUNDARY\s*CLUSTER/.test(n)) return "boundary_cluster";
  if (/BOUNDARY\s*FAT/.test(n)) return "fat_boundary";
  if (/HP\s*COVER/.test(n)) return "homepass_cover";
  if (/HP\s*UNCOVER/.test(n)) return "homepass_uncover";
  if (/HOMEPASS|RUMAH/.test(n)) return "homepass";
  if (/JOINT\s*CLOSURE/.test(n)) return "joint_closure";
  if (/SLACK\s*HANGER/.test(n)) return "slack_hanger";
  if (/SLING\s*WIRE/.test(n)) return "sling_wire";
  if (/EXISTING\s*POLE/.test(n)) return "existing_pole";
  if (/NEW\s*POLE/.test(n)) return "new_pole";
  if (/SUBFEEDER/.test(n)) return "cable_subfeeder";
  if (/DISTRIBUTION\s*CABLE|^CABLE$/.test(n)) return "cable";
  if (/^FAT$/.test(n) || (/\bFAT\b/.test(n) && !/BOUNDARY/.test(n))) return "fat";
  if (/FDT/.test(n)) return "fdt";
  if (/BOUNDARY/.test(n)) return "boundary_area";
  return null;
};

type PlacemarkEntry = { placemark: any; isHomepass: boolean; category: PlacemarkCategory };

const extractPlacemarks = (
  obj: any,
  folderName: string = "",
  parentCategory: PlacemarkCategory = ""
): PlacemarkEntry[] => {
  let result: PlacemarkEntry[] = [];
  if (!obj) return result;

  const detected = detectCategory(folderName);
  const currentCategory: PlacemarkCategory = detected ?? parentCategory;
  const isHomepassFamily =
    currentCategory === "homepass" || currentCategory === "homepass_cover" || currentCategory === "homepass_uncover";

  if (obj.Placemark) {
    const arr = Array.isArray(obj.Placemark) ? obj.Placemark : [obj.Placemark];
    arr.forEach((pm: any) => result.push({ placemark: pm, isHomepass: isHomepassFamily, category: currentCategory }));
  }

  if (obj.Folder) {
    const folders = Array.isArray(obj.Folder) ? obj.Folder : [obj.Folder];
    folders.forEach((f: any) => {
      const fName = getPlacemarkName(f);
      result = result.concat(extractPlacemarks(f, fName, currentCategory));
    });
  }

  if (obj.Document) {
    result = result.concat(extractPlacemarks(obj.Document, folderName, currentCategory));
  }

  return result;
};


// ============================================================
// === START SERVER ===
// ============================================================
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // === 1. INISIALISASI DATABASE SQLITE ===
  const db = new sqlite3.Database("./infralink.db", (err) => {
    if (err) console.error("Error opening database", err.message);
    else console.log("Database SQLite Connected");
  });

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT
    )`);

    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'telkom2026', 'admin')`);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('user1', 'user123', 'user')`);
  });

  // === 2. ENDPOINT LOGIN ===
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (user) {
        res.json({ success: true, role: user.role, username: user.username });
      } else {
        res.status(401).json({ success: false, error: "Username atau password salah" });
      }
    });
  });

  // === 3. ENDPOINT MANAJEMEN USER ===
  app.get("/api/users", (req, res) => {
    db.all("SELECT id, username, password, role FROM users", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post("/api/users", (req, res) => {
    const { username, password, role } = req.body;
    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, password, role || 'user'], function(err) {
      if (err) return res.status(400).json({ error: "Username mungkin sudah ada" });
      res.json({ id: this.lastID, username, role });
    });
  });

  app.delete("/api/users/:id", (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM users WHERE id = ?", id, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      shapefile_roads: true,
      shapefile_buildings: true,
      template_dxf: true
    });
  });

  // === 4. ENDPOINT KML TO DXF ===
  app.post("/api/upload_kml", upload.single("file"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const kmlContent = fs.readFileSync(req.file.path, "utf-8");
      const parser = new XMLParser(KML_PARSER_OPTIONS);
      const jsonObj = parser.parse(kmlContent);

      const offsetXMeters = parseFloat(req.body?.offsetX) || 0;
      const offsetYMeters = parseFloat(req.body?.offsetY) || 0;

      let globalTextRotationDeg = 0;
      const manualLabelRotation =
        req.body?.labelRotation !== undefined && req.body.labelRotation !== ""
          ? parseFloat(req.body.labelRotation)
          : null;
      if (manualLabelRotation !== null && !isNaN(manualLabelRotation)) {
        globalTextRotationDeg = manualLabelRotation;
      }

      const houseLabelMode: "building" | "vertical" | "street" =
        req.body?.houseLabelMode === "vertical" || req.body?.houseLabelMode === "street"
          ? req.body.houseLabelMode
          : "building";

      let houseLabelRotationDeg = 90;
      const manualHouseLabelRotation =
        req.body?.houseLabelRotation !== undefined && req.body.houseLabelRotation !== ""
          ? parseFloat(req.body.houseLabelRotation)
          : null;
      if (manualHouseLabelRotation !== null && !isNaN(manualHouseLabelRotation)) {
        houseLabelRotationDeg = manualHouseLabelRotation;
      }

      const POLE_LABEL_ROTATION_DEG = 90;

      type BuildingFootprint = { cx: number; cy: number; angleDeg: number; lengthAlongAxis: number };
      const buildingFootprints: BuildingFootprint[] = [];

      const findNearestBuilding = (x: number, y: number, maxDist = 12): BuildingFootprint | null => {
        let best: BuildingFootprint | null = null;
        let bestDist = maxDist;
        for (const b of buildingFootprints) {
          const dx = b.cx - x;
          const dy = b.cy - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < bestDist) {
            bestDist = dist;
            best = b;
          }
        }
        return best;
      };

      const d = new Drawing();
      // @ts-ignore
      d.setUnits("Meters");
      // @ts-ignore
      d.addLineType("DASHEDSMALL", "_ _ _ _", [2.5, -2.5]);

      const _projRaw = (lon: number, lat: number) => {
         const r = 6378137;
         const x = (lon * Math.PI / 180) * r;
         const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * r;
         return { x, y };
      };

      const getAciColorForCable = (name: string): number => {
        const u = name.toUpperCase();
        const checkColor = (code: string) => {
           if (code === '01') return 150;
           if (code === '02') return 40;
           if (code === '03') return 80;
           if (code === '04') return 34;
           if (code === '05') return 9;
           if (code === '06') return 7;
           if (code === '07') return 1;
           if (code === '08') return 250;
           if (code === '09') return 2;
           if (code === '10') return 200;
           if (code === '11') return 210;
           if (code === '12') return 4;
           return null;
        };

        for (let i = 1; i <= 12; i++) {
           const c = i.toString().padStart(2, '0');
           if (u.includes(`D.${c}`)) {
               const mapped = checkColor(c);
               if (mapped) return mapped;
           }
        }

        const matchSuffix = u.match(/(\d{2})$/);
        if (matchSuffix) {
           const mapped = checkColor(matchSuffix[1]);
           if (mapped) return mapped;
        }

        return 3;
      };

      d.addLayer("OSM_Highway", 8, "CONTINUOUS");
      d.addLayer("OSM_Highway_Inner", 8, "CONTINUOUS");
      d.addLayer("OSM_Building", 9, "CONTINUOUS");

      for (let i = 1; i <= 12; i++) {
        const code = `D.${i.toString().padStart(2, '0')}`;
        d.addLayer(`KML_${code}`, getAciColorForCable(code), "CONTINUOUS");
      }
      d.addLayer("KML_Default", 3, "CONTINUOUS");
      d.addLayer("KML_Points", 1, "CONTINUOUS");
      d.addLayer("KML_Rumah", 6, "CONTINUOUS");

      d.addLayer("APD_HP_Cover", 6, "CONTINUOUS");
      d.addLayer("APD_HP_Uncover", 1, "CONTINUOUS");
      d.addLayer("APD_FDT", 1, "CONTINUOUS");
      d.addLayer("APD_FAT", 30, "CONTINUOUS");
      
      d.addLayer("APD_FAT_A", 5, "CONTINUOUS");      
      d.addLayer("APD_FAT_B", 40, "CONTINUOUS");     
      d.addLayer("APD_FAT_C", 3, "CONTINUOUS");      
      d.addLayer("APD_FAT_YELLOW", 2, "CONTINUOUS"); 
      d.addLayer("APD_FAT_Boundary", 4, "DASHEDSMALL");
      
      d.addLayer("APD_OTB", 5, "CONTINUOUS");
      d.addLayer("APD_HH", 30, "CONTINUOUS");
      d.addLayer("APD_ONT", 7, "CONTINUOUS");
      d.addLayer("APD_Closure", 1, "CONTINUOUS");
      d.addLayer("APD_FigureEight", 1, "CONTINUOUS");
      
      d.addLayer("APD_Pole_New_9M", 5, "CONTINUOUS");     
      d.addLayer("APD_Pole_New_7M_4", 3, "CONTINUOUS");   
      d.addLayer("APD_Pole_New_7M_3", 4, "CONTINUOUS");   
      d.addLayer("APD_Pole_Existing", 1, "CONTINUOUS");   
      d.addLayer("APD_Pole_Removed", 1, "CONTINUOUS");

      d.addLayer("APD_GarduPLN", 30, "CONTINUOUS");
      d.addLayer("APD_STO", 6, "CONTINUOUS");
      d.addLayer("APD_SlackHanger", 1, "CONTINUOUS");
      d.addLayer("APD_SlingWire", 4, "CONTINUOUS");
      // @ts-ignore
      (d as any).layers["APD_SlingWire"].setTrueColor((0 << 16) | (168 << 8) | 156);
      d.addLayer("APD_BoundaryCluster", 3, "CONTINUOUS");
      d.addLayer("APD_Label", 7, "CONTINUOUS");

      const FIBER_CORE_COLORS: { core: number; aci: number }[] = [
        { core: 12, aci: 30 },  
        { core: 24, aci: 3 },   
        { core: 36, aci: 200 }, 
        { core: 48, aci: 200 }, 
        { core: 72, aci: 42 },  
        { core: 96, aci: 1 },   
        { core: 144, aci: 62 }, 
        { core: 288, aci: 30 }, 
      ];
      FIBER_CORE_COLORS.forEach(({ core, aci }) => {
        d.addLayer(`APD_Cable_${core}C`, aci, "CONTINUOUS");
      });
      d.addLayer("APD_Cable_Default", 7, "CONTINUOUS");

      const getFatLayer = (name: string): string => {
        const upper = name.toUpperCase();
        if (/A\d+/.test(upper) || /\bA\b/.test(upper) || /FATA/.test(upper)) return "APD_FAT_A"; 
        if (/B\d+/.test(upper) || /\bB\b/.test(upper) || /FATB/.test(upper)) return "APD_FAT_B"; 
        if (/C\d+/.test(upper) || /\bC\b/.test(upper) || /FATC/.test(upper)) return "APD_FAT_C"; 
        return "APD_FAT_A"; 
      };

      const placemarkEntries = extractPlacemarks(jsonObj.kml || jsonObj);
      const placemarks = placemarkEntries.map((e) => e.placemark);

      let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
      const updateBounds = (lon: number, lat: number) => {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      };

      placemarks.forEach((p) => {
        const geoms = collectGeometries(p);
        geoms.forEach((g) => {
          if (g.kind === "Point") {
            const coords = g.coordinates.trim().split(",");
            if (coords.length >= 2) updateBounds(parseFloatVal(coords[0]) || 0, parseFloatVal(coords[1]) || 0);
          } else {
            const rawCoords = g.coordinates.trim().split(/\s+/);
            rawCoords.forEach((c: string) => {
              const parts = c.split(",");
              if (parts.length >= 2) updateBounds(parseFloatVal(parts[0]) || 0, parseFloatVal(parts[1]) || 0);
            });
          }
        });
      });

      const centerLon = minLon === Infinity ? 0 : (minLon + maxLon) / 2;
      const centerLat = minLat === Infinity ? 0 : (minLat + maxLat) / 2;
      
      const centerPrjRaw = _projRaw(centerLon, centerLat);
      const trueLocalScale = Math.cos(centerLat * Math.PI / 180);

      const proj = (lon: number, lat: number) => {
         const p = _projRaw(lon, lat);
         return { 
             x: (p.x - centerPrjRaw.x) * trueLocalScale, 
             y: (p.y - centerPrjRaw.y) * trueLocalScale 
         };
      };

      const projKml = (lon: number, lat: number) => {
         const p = proj(lon, lat);
         return { x: p.x + offsetXMeters, y: p.y + offsetYMeters };
      };

      if (minLon !== Infinity && minLat !== Infinity) {
        const padLon = (maxLon - minLon) * 0.1 || 0.002;
        const padLat = (maxLat - minLat) * 0.1 || 0.002;
        const offsetLonDeg = Math.abs(offsetXMeters) / (111320 * Math.cos(centerLat * Math.PI / 180) || 111320);
        const offsetLatDeg = Math.abs(offsetYMeters) / 111320;
        const bMinLon = minLon - padLon - offsetLonDeg;
        const bMinLat = minLat - padLat - offsetLatDeg;
        const bMaxLon = maxLon + padLon + offsetLonDeg;
        const bMaxLat = maxLat + padLat + offsetLatDeg;

        const overpassQuery = `
          [out:json][timeout:90];
          (
            way["highway"](${bMinLat},${bMinLon},${bMaxLat},${bMaxLon});
            way["building"](${bMinLat},${bMinLon},${bMaxLat},${bMaxLon});
          );
          out body;
          >;
          out skel qt;
        `;

        let osmData: any = null;
        let fetchSuccess = false;
        const endpoints = [
           "https://lz4.overpass-api.de/api/interpreter",
           "https://overpass-api.de/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter",
           "https://overpass.osm.ch/api/interpreter"
        ];

        console.log("-----------------------------------------------------");
        console.log(`[OSM] Memulai download peta jalan & rumah (Area: ${bMinLon.toFixed(4)}, ${bMinLat.toFixed(4)})...`);
        
        for (const endpoint of endpoints) {
           try {
              console.log(`[OSM] Mencoba menghubungi: ${endpoint}...`);
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 90000); 
              const osmRes = await fetch(endpoint, {
                 method: "POST",
                 body: overpassQuery,
                 headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "KMLtoDXFConverter/5.0"
                 },
                 signal: controller.signal
              });

              clearTimeout(timeoutId);

              if (osmRes.ok) {
                 osmData = await osmRes.json();
                 fetchSuccess = true;
                 console.log(`✅ [OSM] Sukses mengunduh peta dari ${endpoint}`);
                 break;
              } else {
                 console.warn(`⚠️ [OSM] Gagal dari ${endpoint}: HTTP ${osmRes.status}`);
              }
           } catch (e: any) {
              console.error(`❌ [OSM] Error/Timeout dari ${endpoint}: ${e.message}`);
           }
        }

        if (!fetchSuccess) {
           console.error("\n=========================================================================");
           console.error("🔴 PERINGATAN: GAGAL MENDOWNLOAD PETA OPENSTREETMAP (OSM) 🔴");
           console.error("Semua server publik saat ini sedang sibuk, membatasi request, atau down.");
           console.error("File DXF tetap akan dibuat, tapi HANYA menampilkan data KML tanpa rumah & jalan.");
           console.error("Solusi: Tunggu beberapa menit lalu coba upload lagi file KML Anda.");
           console.error("=========================================================================\n");
        } else if (osmData && osmData.elements) {
           const nodeMap = new Map<number, { lon: number, lat: number, x: number, y: number }>();
           osmData.elements.forEach((el: any) => {
              if (el.type === "node") {
                 const prj = proj(el.lon, el.lat);
                 nodeMap.set(el.id, { lon: el.lon, lat: el.lat, x: prj.x, y: prj.y });
              }
           });

           if (manualLabelRotation === null) {
              let maxSegLen = 0;
              let bestAngleDeg = 0;
              osmData.elements.forEach((el: any) => {
                 if (el.type === "way" && el.nodes && el.tags && el.tags.highway) {
                    for (let i = 0; i < el.nodes.length - 1; i++) {
                       const a = nodeMap.get(el.nodes[i]);
                       const b = nodeMap.get(el.nodes[i + 1]);
                       if (!a || !b) continue;
                       const dx = b.x - a.x;
                       const dy = b.y - a.y;
                       const segLen = Math.sqrt(dx * dx + dy * dy);
                       if (segLen > maxSegLen) {
                          maxSegLen = segLen;
                          bestAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                       }
                    }
                 }
              });
              while (bestAngleDeg > 90) bestAngleDeg -= 180;
              while (bestAngleDeg < -90) bestAngleDeg += 180;
              globalTextRotationDeg = maxSegLen > 0 ? bestAngleDeg : 0;
           }

           const drawRoadOutline = (offsetMeters: number, layerName: string) => {
              const bufferGeoms: any[] = [];
              osmData.elements.forEach((el: any) => {
                 if (el.type === "way" && el.nodes && el.tags && el.tags.highway) {
                    const coords: [number, number][] = [];
                    el.nodes.forEach((nid: number) => {
                       const n = nodeMap.get(nid);
                       if (n) coords.push([n.lon, n.lat]);
                    });

                    if (coords.length > 1) {
                       try {
                          const line = turf.lineString(coords);
                          const buffered = turf.buffer(line, offsetMeters, { units: "meters" });
                          if (buffered && buffered.geometry) {
                             const geom = buffered.geometry;
                             bufferGeoms.push(geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates);
                          }
                       } catch (e: any) {}
                    }
                 }
              });

              let unified: any[] = [];
              if (bufferGeoms.length === 1) {
                 unified = bufferGeoms[0];
              } else if (bufferGeoms.length > 1) {
                 try {
                    unified = polygonClipping.union(bufferGeoms[0], ...bufferGeoms.slice(1));
                 } catch (e: any) {
                    unified = ([] as any[]).concat(...bufferGeoms);
                 }
              }

              d.setActiveLayer(layerName);
              unified.forEach((polygon: number[][][]) => {
                 polygon.forEach((ring: number[][]) => {
                    const projectedRing: [number, number][] = ring.map(([lon, lat]) => {
                       const p = proj(lon, lat);
                       return [p.x, p.y];
                    });
                    if (projectedRing.length > 2) {
                       // @ts-ignore
                       d.drawPolyline(projectedRing, true);
                    }
                 });
              });
           };

           const lebarJalanTotal = 6;
           const ROAD_WIDTH_DIFFERENCE = 1;
           const jarakOffsetLuar = lebarJalanTotal / 2;
           const jarakOffsetDalam = jarakOffsetLuar - ROAD_WIDTH_DIFFERENCE / 2;

           drawRoadOutline(jarakOffsetLuar, "OSM_Highway");
           if (jarakOffsetDalam > 0) {
              drawRoadOutline(jarakOffsetDalam, "OSM_Highway_Inner");
           }

           osmData.elements.forEach((el: any) => {
              if (el.type === "way" && el.nodes && el.tags && el.tags.building) {
                 const pts: [number, number][] = [];
                 el.nodes.forEach((nid: number) => {
                    const n = nodeMap.get(nid);
                    if (n) pts.push([n.x, n.y]);
                 });
                 if (pts.length > 1) {
                    d.setActiveLayer("OSM_Building");
                    // @ts-ignore
                    d.drawPolyline(pts, true);

                    let sumX = 0, sumY = 0;
                    let maxSideLen = 0, bestSideAngle = 0;
                    for (let i = 0; i < pts.length; i++) {
                       sumX += pts[i][0];
                       sumY += pts[i][1];
                       const next = pts[(i + 1) % pts.length];
                       const dx = next[0] - pts[i][0];
                       const dy = next[1] - pts[i][1];
                       const len = Math.sqrt(dx * dx + dy * dy);
                       if (len > maxSideLen) {
                          maxSideLen = len;
                          bestSideAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
                       }
                    }
                    while (bestSideAngle > 90) bestSideAngle -= 180;
                    while (bestSideAngle < -90) bestSideAngle += 180;
                    buildingFootprints.push({
                       cx: sumX / pts.length,
                       cy: sumY / pts.length,
                       angleDeg: bestSideAngle,
                       lengthAlongAxis: maxSideLen,
                    });
                 }
              }
           });
        }
      }

      const greenBoundaryPolygons: [number, number][][] = [];
      placemarkEntries.forEach(({ placemark: p, category }) => {
        if (category !== "boundary_cluster") return;
        const geoms = collectGeometries(p);
        geoms.forEach((g) => {
          if (g.kind !== "Polygon") return;
          const rawCoords = g.coordinates.trim().split(/\s+/);
          const ring: [number, number][] = rawCoords
            .map((c: string) => {
              const parts = c.split(",");
              if (parts.length < 2) return null;
              const prj = projKml(parseFloatVal(parts[0]) || 0, parseFloatVal(parts[1]) || 0);
              return [prj.x, prj.y] as [number, number];
            })
            .filter((pt): pt is [number, number] => pt !== null);
          if (ring.length >= 3) greenBoundaryPolygons.push(ring);
        });
      });

      const CHAR_WIDTH_FACTOR = 0.6;
      const DEFAULT_HOUSE_TEXT_HEIGHT = 1.6;
      const MIN_HOUSE_TEXT_HEIGHT = 0.5;
      const BUILDING_TEXT_PADDING = 1;

      const estimateTextWidth = (text: string, height: number): number =>
        Math.max(text.length, 1) * height * CHAR_WIDTH_FACTOR;

      const drawBoldText = (
        d: any,
        x: number,
        y: number,
        height: number,
        rotationDeg: number,
        text: string
      ) => {
        d.drawText(x, y, height, rotationDeg, text);
      };

      type LabelCircle = { cx: number; cy: number; r: number };
      const placedLabelCircles: LabelCircle[] = [];
      const LABEL_COLLISION_MARGIN = 0.92;

      const labelOverlapsExisting = (cx: number, cy: number, r: number): boolean =>
        placedLabelCircles.some((b) => {
          const dx = b.cx - cx;
          const dy = b.cy - cy;
          return Math.sqrt(dx * dx + dy * dy) < (b.r + r) * LABEL_COLLISION_MARGIN;
        });

      type IconCircle = { cx: number; cy: number; r: number };
      const placedIconCircles: IconCircle[] = [];
      const ICON_COLLISION_MARGIN = 0.98;

      const iconOverlapsExisting = (cx: number, cy: number, r: number): boolean =>
        placedIconCircles.some((b) => {
          const dx = b.cx - cx;
          const dy = b.cy - cy;
          return Math.sqrt(dx * dx + dy * dy) < (b.r + r) * ICON_COLLISION_MARGIN;
        });

      const findClearIconPosition = (x: number, y: number, r: number): { x: number; y: number } => {
        if (!iconOverlapsExisting(x, y, r)) {
          placedIconCircles.push({ cx: x, cy: y, r });
          return { x, y };
        }

        const baseCandidates: { dx: number; dy: number }[] = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0.7, dy: 0.7 },
          { dx: -0.7, dy: 0.7 },
          { dx: 0.7, dy: -0.7 },
          { dx: -0.7, dy: -0.7 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ];

        const RING_MULTIPLIERS = [2.1, 3.2, 4.3, 5.4, 6.5];
        for (const mult of RING_MULTIPLIERS) {
          for (const c of baseCandidates) {
            const dist = r * mult;
            const candX = x + c.dx * dist;
            const candY = y + c.dy * dist;
            if (!iconOverlapsExisting(candX, candY, r)) {
              placedIconCircles.push({ cx: candX, cy: candY, r });
              return { x: candX, y: candY };
            }
          }
        }

        placedIconCircles.push({ cx: x, cy: y, r });
        return { x, y };
      };

      const findClearLabelOffset = (
        x: number,
        y: number,
        text: string,
        height: number,
        defaultOffsetX: number,
        defaultOffsetY: number,
        rotationDeg: number
      ): { offsetX: number; offsetY: number } => {
        const width = estimateTextWidth(text, height);
        const radius = Math.max(width, height) * 0.6 + 0.3;
        const baseDist = Math.max(Math.abs(defaultOffsetX), Math.abs(defaultOffsetY), height * 2, width * 0.6);

        const baseCandidates: { offsetX: number; offsetY: number }[] = [
          { offsetX: defaultOffsetX, offsetY: defaultOffsetY },
          { offsetX: -(baseDist + width), offsetY: defaultOffsetY },
          { offsetX: -width / 2, offsetY: baseDist },
          { offsetX: -width / 2, offsetY: -(baseDist + height) },
          { offsetX: baseDist * 0.7, offsetY: baseDist * 0.7 },
          { offsetX: -(baseDist * 0.7 + width), offsetY: baseDist * 0.7 },
          { offsetX: baseDist * 0.7, offsetY: -(baseDist * 0.7 + height) },
          { offsetX: -(baseDist * 0.7 + width), offsetY: -(baseDist * 0.7 + height) },
        ];

        for (const cand of baseCandidates) {
          const rot = rotateOffset(cand.offsetX, cand.offsetY, rotationDeg);
          if (!labelOverlapsExisting(x + rot.x, y + rot.y, radius)) {
            return cand;
          }
        }

        const RING_DISTANCE_MULTIPLIERS = [1.3, 1.6, 2.0, 2.5];
        for (const mult of RING_DISTANCE_MULTIPLIERS) {
          for (const cand of baseCandidates) {
            const scaled = { offsetX: cand.offsetX * mult, offsetY: cand.offsetY * mult };
            const rot = rotateOffset(scaled.offsetX, scaled.offsetY, rotationDeg);
            if (!labelOverlapsExisting(x + rot.x, y + rot.y, radius)) {
              return scaled;
            }
          }
        }

        return { offsetX: defaultOffsetX, offsetY: defaultOffsetY };
      };

      const drawLabelText = (
        d: any,
        x: number,
        y: number,
        height: number,
        text: string,
        offsetX: number = 0,
        offsetY: number = 0,
        rotationDeg: number = globalTextRotationDeg
      ) => {
        const width = estimateTextWidth(text, height);
        const radius = Math.max(width, height) * 0.6 + 0.3;

        const baseOff = rotateOffset(offsetX, offsetY, rotationDeg);
        const baseX = x + baseOff.x;
        const baseY = y + baseOff.y;

        let labelX = baseX;
        let labelY = baseY;

        if (labelOverlapsExisting(labelX, labelY, radius)) {
          const maxAttempts = 12;
          const stepDistance = Math.max(radius * 0.9, 0.6);
          let found = false;
          for (let i = 1; i <= maxAttempts && !found; i++) {
            const angle = (i * 47) % 360;
            const dist = stepDistance * (1 + Math.floor((i - 1) / 6) * 0.6);
            const candX = baseX + dist * Math.cos(toRad(angle));
            const candY = baseY + dist * Math.sin(toRad(angle));
            if (!labelOverlapsExisting(candX, candY, radius)) {
              labelX = candX;
              labelY = candY;
              found = true;
            }
          }
        }

        placedLabelCircles.push({ cx: labelX, cy: labelY, r: radius });
        d.drawText(labelX, labelY, height, rotationDeg, text);
      };

      const drawSmartLabel = (
        d: any,
        x: number,
        y: number,
        height: number,
        text: string,
        defaultOffsetX: number = 0,
        defaultOffsetY: number = 0,
        rotationDeg: number = globalTextRotationDeg
      ) => {
        const { offsetX, offsetY } = findClearLabelOffset(x, y, text, height, defaultOffsetX, defaultOffsetY, rotationDeg);
        drawLabelText(d, x, y, height, text, offsetX, offsetY, rotationDeg);
      };

      const LINE_SPACING_FACTOR = 1.3;

      const estimateLinesWidth = (lines: string[], height: number): number =>
        Math.max(...lines.map((l) => estimateTextWidth(l, height)));

      const estimateLinesHeight = (lines: string[], height: number): number =>
        lines.length * height * LINE_SPACING_FACTOR;

      const findClearMultilineOffset = (
        x: number,
        y: number,
        lines: string[],
        height: number,
        defaultOffsetX: number,
        defaultOffsetY: number,
        rotationDeg: number
      ): { offsetX: number; offsetY: number } => {
        const width = estimateLinesWidth(lines, height);
        const blockHeight = estimateLinesHeight(lines, height);
        const radius = Math.max(width, blockHeight) * 0.6 + 0.3;
        const baseDist = Math.max(Math.abs(defaultOffsetX), Math.abs(defaultOffsetY), height * 2, width * 0.6);

        const baseCandidates: { offsetX: number; offsetY: number }[] = [
          { offsetX: defaultOffsetX, offsetY: defaultOffsetY },
          { offsetX: -(baseDist + width), offsetY: defaultOffsetY },
          { offsetX: -width / 2, offsetY: baseDist },
          { offsetX: -width / 2, offsetY: -(baseDist + blockHeight) },
          { offsetX: baseDist * 0.7, offsetY: baseDist * 0.7 },
          { offsetX: -(baseDist * 0.7 + width), offsetY: baseDist * 0.7 },
          { offsetX: baseDist * 0.7, offsetY: -(baseDist * 0.7 + blockHeight) },
          { offsetX: -(baseDist * 0.7 + width), offsetY: -(baseDist * 0.7 + blockHeight) },
        ];

        for (const cand of baseCandidates) {
          const rot = rotateOffset(cand.offsetX, cand.offsetY, rotationDeg);
          if (!labelOverlapsExisting(x + rot.x, y + rot.y, radius)) {
            return cand;
          }
        }

        const RING_DISTANCE_MULTIPLIERS = [1.3, 1.6, 2.0, 2.5];
        for (const mult of RING_DISTANCE_MULTIPLIERS) {
          for (const cand of baseCandidates) {
            const scaled = { offsetX: cand.offsetX * mult, offsetY: cand.offsetY * mult };
            const rot = rotateOffset(scaled.offsetX, scaled.offsetY, rotationDeg);
            if (!labelOverlapsExisting(x + rot.x, y + rot.y, radius)) {
              return scaled;
            }
          }
        }

        return { offsetX: defaultOffsetX, offsetY: defaultOffsetY };
      };

      const drawMultilineLabelText = (
        d: any,
        x: number,
        y: number,
        height: number,
        lines: string[],
        offsetX: number = 0,
        offsetY: number = 0,
        rotationDeg: number = globalTextRotationDeg
      ) => {
        const width = estimateLinesWidth(lines, height);
        const blockHeight = estimateLinesHeight(lines, height);
        const radius = Math.max(width, blockHeight) * 0.6 + 0.3;

        const baseOff = rotateOffset(offsetX, offsetY, rotationDeg);
        const baseX = x + baseOff.x;
        const baseY = y + baseOff.y;

        let anchorX = baseX;
        let anchorY = baseY;

        if (labelOverlapsExisting(anchorX, anchorY, radius)) {
          const maxAttempts = 12;
          const stepDistance = Math.max(radius * 0.9, 0.6);
          let found = false;
          for (let i = 1; i <= maxAttempts && !found; i++) {
            const angle = (i * 47) % 360;
            const dist = stepDistance * (1 + Math.floor((i - 1) / 6) * 0.6);
            const candX = baseX + dist * Math.cos(toRad(angle));
            const candY = baseY + dist * Math.sin(toRad(angle));
            if (!labelOverlapsExisting(candX, candY, radius)) {
              anchorX = candX;
              anchorY = candY;
              found = true;
            }
          }
        }

        placedLabelCircles.push({ cx: anchorX, cy: anchorY, r: radius });

        const dxAbs = anchorX - x;
        const dyAbs = anchorY - y;
        const inv = rotateOffset(dxAbs, dyAbs, -rotationDeg);

        lines.forEach((line, i) => {
          const lineLocalOffsetY = inv.y - i * height * LINE_SPACING_FACTOR;
          const r = rotateOffset(inv.x, lineLocalOffsetY, rotationDeg);
          d.drawText(x + r.x, y + r.y, height, rotationDeg, line);
        });
      };

      const drawSmartMultilineLabel = (
        d: any,
        x: number,
        y: number,
        height: number,
        lines: string[],
        defaultOffsetX: number = 0,
        defaultOffsetY: number = 0,
        rotationDeg: number = globalTextRotationDeg
      ) => {
        if (lines.length <= 1) {
          drawSmartLabel(d, x, y, height, lines[0] ?? "", defaultOffsetX, defaultOffsetY, rotationDeg);
          return;
        }
        const { offsetX, offsetY } = findClearMultilineOffset(
          x, y, lines, height, defaultOffsetX, defaultOffsetY, rotationDeg
        );
        drawMultilineLabelText(d, x, y, height, lines, offsetX, offsetY, rotationDeg);
      };

      const POLE_LABEL_WRAP_THRESHOLD = 8;
      const splitPoleNameLines = (safeName: string): string[] => {
        const dashIndex = safeName.indexOf("-");
        if (dashIndex > 0 && dashIndex < safeName.length - 1) {
          return [safeName.slice(0, dashIndex), safeName.slice(dashIndex)];
        }

        if (safeName.length <= POLE_LABEL_WRAP_THRESHOLD) {
          return [safeName];
        }

        const mid = safeName.length / 2;
        let bestDotIndex = -1;
        let bestDotDist = Infinity;
        for (let i = 0; i < safeName.length; i++) {
          if (safeName[i] === ".") {
            const dist = Math.abs(i - mid);
            if (dist < bestDotDist) {
              bestDotDist = dist;
              bestDotIndex = i;
            }
          }
        }
        if (bestDotIndex > 0 && bestDotIndex < safeName.length - 1) {
          return [safeName.slice(0, bestDotIndex), safeName.slice(bestDotIndex)];
        }

        const splitAt = Math.ceil(safeName.length / 2);
        return [safeName.slice(0, splitAt), safeName.slice(splitAt)];
      };

      const splitNameIntoWordLines = (safeName: string, maxWordsPerLine: number = 2): string[] => {
        const words = safeName.split(/\s+/).filter(Boolean);
        if (words.length <= maxWordsPerLine) return [safeName];
        const lines: string[] = [];
        for (let i = 0; i < words.length; i += maxWordsPerLine) {
          lines.push(words.slice(i, i + maxWordsPerLine).join(" "));
        }
        return lines;
      };

      const drawRectangle = (
        d: any,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        thickness: number = 0
      ) => {
          d.drawLine(x1, y1, x2, y1);
          d.drawLine(x2, y1, x2, y2);
          d.drawLine(x2, y2, x1, y2);
          d.drawLine(x1, y2, x1, y1);
          if (thickness > 0) {
            const t = thickness;
            d.drawLine(x1 + t, y1 + t, x2 - t, y1 + t);
            d.drawLine(x2 - t, y1 + t, x2 - t, y2 - t);
            d.drawLine(x2 - t, y2 - t, x1 + t, y2 - t);
            d.drawLine(x1 + t, y2 - t, x1 + t, y1 + t);
          }
      };

      const isHouseNumberName = (safeName: string, lowerName: string): boolean => {
        const s = safeName.trim();
        if (/^\d+[a-z]{0,3}$/i.test(s)) return true;
        if (/^\d+[a-z]?[\s-].+/i.test(s)) return true;
        if (/^[a-z]-\d+$/i.test(s)) return true;
        if (/^nn(-\d+)?$/i.test(s)) return true;
        if (lowerName.includes("rumah")) return true;
        return false;
      };

      const drawHouseLabel = (
        d: any,
        x: number,
        y: number,
        safeName: string,
        rotationDeg: number,
        textHeight: number,
        layerName: string = "KML_Rumah"
      ) => {
        d.setActiveLayer(layerName);
        const nameLines = splitNameIntoWordLines(safeName, 2);
        const centeredOffsetX = -estimateLinesWidth(nameLines, textHeight) / 2;
        const centeredOffsetY = -textHeight / 2;
        drawSmartMultilineLabel(d, x, y, textHeight, nameLines, centeredOffsetX, centeredOffsetY, rotationDeg);
      };

      const drawHouseMarker = (
        d: any,
        x: number,
        y: number,
        rawName: string,
        homepassCategory: PlacemarkCategory = "homepass"
      ) => {
        const safeName = sanitizeDxfText(rawName) || "Unnamed";
        const nearbyBuilding = findNearestBuilding(x, y);
        const hasOsmBuildingNearby = nearbyBuilding !== null;

        const textLayer =
          homepassCategory === "homepass_uncover"
            ? "APD_HP_Uncover"
            : homepassCategory === "homepass_cover"
            ? "APD_HP_Cover"
            : "KML_Rumah";

        let rotationDeg = houseLabelRotationDeg;
        if (manualHouseLabelRotation === null) {
          if (houseLabelMode === "building" && hasOsmBuildingNearby) {
            rotationDeg = nearbyBuilding!.angleDeg;
          } else if (houseLabelMode === "street") {
            rotationDeg = globalTextRotationDeg;
          }
        }

        let textHeight = DEFAULT_HOUSE_TEXT_HEIGHT;

        if (hasOsmBuildingNearby) {
          const availableWidth = Math.max(nearbyBuilding!.lengthAlongAxis - BUILDING_TEXT_PADDING, 0.1);
          const widthAtDefaultHeight = estimateTextWidth(safeName, DEFAULT_HOUSE_TEXT_HEIGHT);
          if (widthAtDefaultHeight > availableWidth) {
            const scale = availableWidth / widthAtDefaultHeight;
            textHeight = Math.max(DEFAULT_HOUSE_TEXT_HEIGHT * scale, MIN_HOUSE_TEXT_HEIGHT);
          }
        }

        drawHouseLabel(d, x, y, safeName, rotationDeg, textHeight, textLayer);
      };

      const getIconRadiusForName = (name: string): number => {
        if (name.includes("odc") || name.includes("fat")) return 8.4;
        if (name.includes("olt")) return 8.64;
        if (name.includes("odp") || name.includes("fdt")) return 3.33;
        if (name.includes("otb")) return 2.8;
        if (name.includes("uc")) return 1;
        if (name.includes("slack")) return 2.0;
        if (name.includes("te") || name.includes("ex")) return 1.6;
        if (name.includes("np9")) return 1.6;
        if (name.includes("np7") || name.includes("np")) return 2.26;
        if (name.includes("sto")) return 2.6;
        return 1.5;
      };
      
      const getNewPoleLayer = (name: string): string => {
        const upper = name.toUpperCase();
        if (/\bNP\s*-?\s*9\b/.test(upper) || upper.includes("NP9") || /\b9\s*M\b/.test(upper)) {
          return "APD_Pole_New_9M";
        }
        if (upper.includes("3\"") || upper.includes("3IN") || upper.includes("3 IN") || upper.includes("3'")) {
          return "APD_Pole_New_7M_3";
        }
        return "APD_Pole_New_7M_4";
      };

      const clampVal = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

      const getBoxWorldCorners = (
        x: number,
        y: number,
        offsetX: number,
        offsetY: number,
        boxW: number,
        boxH: number,
        rotationDeg: number
      ): [number, number][] => {
        const localCorners: [number, number][] = [
          [offsetX, offsetY],
          [offsetX + boxW, offsetY],
          [offsetX + boxW, offsetY - boxH],
          [offsetX, offsetY - boxH],
        ];
        return localCorners.map(([lx, ly]) => {
          const r = rotateOffset(lx, ly, rotationDeg);
          return [x + r.x, y + r.y] as [number, number];
        });
      };

      const boxIntersectsAnyPolygon = (
        corners: [number, number][],
        polygons: [number, number][][]
      ): boolean => {
        if (polygons.length === 0) return false;
        try {
          const ring = [...corners, corners[0]];
          const boxPoly = turf.polygon([ring]);
          for (const poly of polygons) {
            try {
              const closedRing =
                poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1]
                  ? poly
                  : [...poly, poly[0]];
              if (closedRing.length < 4) continue;
              const otherPoly = turf.polygon([closedRing]);
              if (turf.booleanIntersects(boxPoly, otherPoly)) return true;
            } catch (e) {}
          }
        } catch (e) {
          return false;
        }
        return false;
      };

      const projectPointOutsidePolygons = (
        x: number,
        y: number,
        polygons: [number, number][][],
        margin: number = 2
      ): { x: number; y: number } | null => {
        let best: { x: number; y: number; dist: number } | null = null;
        const pt = turf.point([x, y]);
        for (const poly of polygons) {
          try {
            const closedRing =
              poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1]
                ? poly
                : [...poly, poly[0]];
            if (closedRing.length < 4) continue;
            const turfPoly = turf.polygon([closedRing]);
            if (!turf.booleanPointInPolygon(pt, turfPoly)) continue;
            const line = turf.polygonToLine(turfPoly as any);
            const nearest: any = turf.nearestPointOnLine(line as any, pt);
            const nx = nearest.geometry.coordinates[0];
            const ny = nearest.geometry.coordinates[1];
            const dist = Math.sqrt((nx - x) ** 2 + (ny - y) ** 2);
            if (!best || dist < best.dist) {
              best = { x: nx, y: ny, dist };
            }
          } catch (e) {}
        }
        if (!best) return null;
        const dx = best.x - x;
        const dy = best.y - y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const pushDist = best.dist + margin;
        return { x: x + (dx / len) * pushDist, y: y + (dy / len) * pushDist };
      };

      const findNearestClearBoxOffset = (
        x: number,
        y: number,
        boxW: number,
        boxH: number,
        rotationDeg: number,
        preferredAngleDeg: number | null,
        avoidPolygons: [number, number][][] = []
      ): { offsetX: number; offsetY: number } => {
        const halfDiag = Math.sqrt(boxW * boxW + boxH * boxH) / 2;
        const radius = halfDiag + 0.5;
        const minGap = 1.2; 
        const startDist = halfDiag + minGap;
        const maxDist = startDist + 80; 
        const distStep = 0.75; 
        const angleStep = 15; 

        const isClear = (offsetX: number, offsetY: number): boolean => {
          const centerLocalX = offsetX + boxW / 2;
          const centerLocalY = offsetY - boxH / 2;
          const rot = rotateOffset(centerLocalX, centerLocalY, rotationDeg);
          if (labelOverlapsExisting(x + rot.x, y + rot.y, radius)) return false;
          if (avoidPolygons.length > 0) {
            const corners = getBoxWorldCorners(x, y, offsetX, offsetY, boxW, boxH, rotationDeg);
            if (boxIntersectsAnyPolygon(corners, avoidPolygons)) return false;
          }
          return true;
        };

        const baseAngles: number[] = [];
        for (let a = 0; a < 360; a += angleStep) baseAngles.push(a);

        let angles = baseAngles;
        if (preferredAngleDeg !== null) {
          angles = [...baseAngles].sort((a, b) => {
            const diff = (v: number) => {
              const raw = Math.abs(v - preferredAngleDeg);
              return Math.min(raw, 360 - raw);
            };
            return diff(a) - diff(b);
          });
        }

        for (let dist = startDist; dist <= maxDist; dist += distStep) {
          for (const angle of angles) {
            const rad = toRad(angle);
            const centerWorldDx = dist * Math.cos(rad);
            const centerWorldDy = dist * Math.sin(rad);
            const localCenter = rotateOffset(centerWorldDx, centerWorldDy, -rotationDeg);
            const offsetX = localCenter.x - boxW / 2;
            const offsetY = localCenter.y + boxH / 2;
            if (isClear(offsetX, offsetY)) {
              return { offsetX, offsetY };
            }
          }
        }

        const fallbackAngle = preferredAngleDeg ?? 0;
        const rad = toRad(fallbackAngle);
        const localCenter = rotateOffset(startDist * Math.cos(rad), startDist * Math.sin(rad), -rotationDeg);
        return { offsetX: localCenter.x - boxW / 2, offsetY: localCenter.y + boxH / 2 };
      };

      const drawFatInfoTable = (
        d: any,
        iconX: number,
        iconY: number,
        safeName: string,
        layerName: string,
        rotationDeg: number = globalTextRotationDeg,
        defaultOffsetX: number = 5,
        defaultOffsetY: number = 3
      ) => {
        d.setActiveLayer(layerName);
        
        const rowH = 3.5; 
        const th = 1.3; 
        const w1 = 18; 
        const w2 = 3;  
        const w3 = 12; 
        const totalW = w1 + w2 + w3; 
        const totalH = rowH * 3; 
        
        const cy = -2.3; 

        let preferredAngleDeg: number | null = null;
        const outsidePoint = projectPointOutsidePolygons(iconX, iconY, greenBoundaryPolygons, 2);
        if (outsidePoint) {
          const worldDx = outsidePoint.x - iconX;
          const worldDy = outsidePoint.y - iconY;
          preferredAngleDeg = (Math.atan2(worldDy, worldDx) * 180) / Math.PI;
        }

        const { offsetX, offsetY } = findNearestClearBoxOffset(
          iconX, iconY, totalW, totalH, rotationDeg, preferredAngleDeg, greenBoundaryPolygons
        );

        const anchorOff = rotateOffset(offsetX, offsetY, rotationDeg);
        const anchorX = iconX + anchorOff.x;
        const anchorY = iconY + anchorOff.y;
  
        const rp = (dx: number, dy: number) => {
          const rot = rotateOffset(dx, dy, rotationDeg);
          return { x: anchorX + rot.x, y: anchorY + rot.y };
        };
  
        const p1 = rp(0, 0);
        const p2 = rp(totalW, 0);
        const p3 = rp(totalW, -totalH);
        const p4 = rp(0, -totalH);
        // @ts-ignore
        d.drawPolyline([[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], [p4.x, p4.y]], true);
  
        for (let i = 1; i <= 2; i++) {
           const l1 = rp(0, -i * rowH);
           const l2 = rp(totalW, -i * rowH);
           d.drawLine(l1.x, l1.y, l2.x, l2.y);
        }
  
        const v1a = rp(w1, -rowH);
        const v1b = rp(w1, -totalH);
        d.drawLine(v1a.x, v1a.y, v1b.x, v1b.y);
  
        const v2a = rp(w1 + w2, -rowH);
        const v2b = rp(w1 + w2, -totalH);
        d.drawLine(v2a.x, v2a.y, v2b.x, v2b.y);
  
        const nameW = safeName.length * th * CHAR_WIDTH_FACTOR;
        const t1 = rp((totalW - nameW)/2, cy); 
        d.drawText(t1.x, t1.y, th, rotationDeg, safeName);
  
        const t2a = rp(1.5, -rowH + cy);
        d.drawText(t2a.x, t2a.y, th, rotationDeg, "DISTANCE_TO");
        const t2b = rp(w1 + 1, -rowH + cy);
        d.drawText(t2b.x, t2b.y, th, rotationDeg, ":");
        const t2c = rp(w1 + w2 + 1.5, -rowH + cy);
        d.drawText(t2c.x, t2c.y, th, rotationDeg, ".. m");
  
        const t3a = rp(1.5, -rowH*2 + cy);
        d.drawText(t3a.x, t3a.y, th, rotationDeg, "Power @1490 nm");
        const t3b = rp(w1 + 1, -rowH*2 + cy);
        d.drawText(t3b.x, t3b.y, th, rotationDeg, ":");
        const t3c = rp(w1 + w2 + 1.5, -rowH*2 + cy);
        d.drawText(t3c.x, t3c.y, th, rotationDeg, "... dBm");

        const localMinX = Math.min(0, totalW);
        const localMaxX = Math.max(0, totalW);
        const localMinY = Math.min(0, -totalH);
        const localMaxY = Math.max(0, -totalH);
        const nearestLocalX = clampVal(0, offsetX + localMinX, offsetX + localMaxX);
        const nearestLocalY = clampVal(0, offsetY + localMinY, offsetY + localMaxY);
        const nearestOff = rotateOffset(nearestLocalX, nearestLocalY, rotationDeg);
        const connX = iconX + nearestOff.x;
        const connY = iconY + nearestOff.y;
        d.setActiveLayer(layerName);
        d.drawLine(iconX, iconY, connX, connY);
  
        const centerOffset = rotateOffset(offsetX + totalW/2, offsetY - totalH/2, rotationDeg);
        placedLabelCircles.push({ cx: iconX + centerOffset.x, cy: iconY + centerOffset.y, r: Math.max(totalW, totalH)/2 + 2 });
      };

      const drawIcon = (d: any, x: number, y: number, rawName: string) => {
         const safeName = sanitizeDxfText(String(rawName ?? "").trim()) || "Unnamed";
         const name = safeName.toLowerCase();

         if (isHouseNumberName(safeName, name)) {
            drawHouseMarker(d, x, y, safeName);
            return;
         }

         const iconRadius = getIconRadiusForName(name);
         const adjustedPos = findClearIconPosition(x, y, iconRadius);
         x = adjustedPos.x;
         y = adjustedPos.y;

         let textX = x + 4;
         let textY = y - 2;
         let useDashSplitLabel = false;
         let isVerticalPoleLabel = false;
         let fatLabelLayer: string | null = null;
         let isSlack = false;
         
         if (name.includes("odc") || name.includes("fat")) {
             const isODC = name.includes("odc") && !name.includes("fat");
             
             if (isODC) {
                 const w = 8.4, h = 4.79, mw = 7.7, mh = 4.15, iw = 7.0, ih = 3.5;
                 const border = 0.12;
                 drawRectangle(d, x - w, y - h, x + w, y + h, border);
                 drawRectangle(d, x - mw, y - mh, x + mw, y + mh, border);
                 drawRectangle(d, x - iw, y - ih, x + iw, y + ih, border);
                 drawBoldText(d, x - 3.5, y - 2, 4.71, 0, "ODC");
                 textX = x + 10;
                 useDashSplitLabel = true;
             } else {
                 const layerName = getFatLayer(safeName);
                 d.setActiveLayer(layerName);
                 const w = 4.0, h = 1.5;
                 const border = 0.1;
                 drawRectangle(d, x - w, y - h, x + w, y + h, border); 
                 drawRectangle(d, x - (w - 0.3), y - (h - 0.3), x + (w - 0.3), y + (h - 0.3), border); 
                 
                 d.setActiveLayer("APD_FAT_YELLOW");
                 // @ts-ignore
                 d.drawFace(
                     x - 3.2, y + 0.8, 0,
                     x - 1.8, y, 0,
                     x - 3.2, y - 0.8, 0,
                     x - 3.2, y - 0.8, 0
                 );
                 
                 d.setActiveLayer("APD_Label"); 
                 drawBoldText(d, x - 1, y - 0.75, 1.8, 0, "16");
                 
                 textX = x + 5;
                 useDashSplitLabel = true;
                 fatLabelLayer = layerName;
             }
         } else if (name.includes("olt")) {
             d.drawArc(x, y, 2.7, 0, 360);
             d.drawLine(x - 7.07, y - 1.16, x - 7.07, y + 1.05);
             d.drawLine(x - 8.30, y - 1.86, x - 8.30, y + 1.75);
             d.drawLine(x - 8.64, y - 2.06, x - 8.64, y + 1.95);
             d.drawLine(x - 7.07, y, x, y);
             textX = x + 4;
         } else if (name.includes("odp") || name.includes("fdt")) {
             const border = 0.08;
             drawRectangle(d, x - 3.33, y - 1.895, x + 3.33, y + 1.895, border);
             drawRectangle(d, x - 3.05, y - 1.64, x + 3.05, y + 1.64, border);
             drawRectangle(d, x - 2.775, y - 1.385, x + 2.775, y + 1.385, border);
             drawBoldText(d, x - 1.5, y - 0.9, 1.85, 0, "FDT");
             textX = x + 4;
             useDashSplitLabel = true;
         } else if (name.includes("otb")) {
             drawRectangle(d, x - 2.8, y - 1.9, x + 2.8, y + 1.9, 0.08);
             drawBoldText(d, x - 1.5, y - 0.8, 1.71, 0, "OTB");
             textX = x + 4;
         } else if (name.includes("uc")) {
             drawBoldText(d, x - 1, y - 0.5, 1, 0, "UC");
             d.drawLine(x - 0.5, y - 0.5, x + 0.5, y + 0.5);
             d.drawLine(x - 0.5, y + 0.5, x + 0.5, y - 0.5);
             textX = x + 3;
         } else if (name.includes("slack")) {
             d.setActiveLayer("APD_SlackHanger");
             const scale = 0.65;
             const pts = [
                 [x, y],
                 [x + 1.2*scale, y + 1.2*scale],
                 [x + 2.5*scale, y + 1.5*scale],
                 [x + 3.8*scale, y + 1.2*scale],
                 [x + 4.5*scale, y],
                 [x + 3.8*scale, y - 1.2*scale],
                 [x + 2.5*scale, y - 1.5*scale],
                 [x + 1.2*scale, y - 1.2*scale],
                 [x, y],
                 [x - 1.2*scale, y - 1.2*scale],
                 [x - 2.5*scale, y - 1.5*scale],
                 [x - 3.8*scale, y - 1.2*scale],
                 [x - 4.5*scale, y],
                 [x - 3.8*scale, y + 1.2*scale],
                 [x - 2.5*scale, y + 1.5*scale],
                 [x - 1.2*scale, y + 1.2*scale],
                 [x, y]
             ];
             // @ts-ignore
             d.drawPolyline(pts, true);
             isSlack = true; 
         } else if (name.includes("te") || name.includes("ex") || name.includes("existing")) {
             d.setActiveLayer("APD_Pole_Existing");
             const poleR = 1.8;
             d.drawArc(x, y, poleR, 0, 360);
             const crossOffset = poleR * Math.SQRT1_2;
             d.drawLine(x - crossOffset, y - crossOffset, x + crossOffset, y + crossOffset);
             d.drawLine(x - crossOffset, y + crossOffset, x + crossOffset, y - crossOffset);
             textX = x + 3;
             useDashSplitLabel = true;
             isVerticalPoleLabel = true;
         } else if (name.includes("np9") || name.includes("np7") || name.includes("np")) {
             const layerName = getNewPoleLayer(safeName);
             d.setActiveLayer(layerName);
             const poleR = 1.8;
             d.drawArc(x, y, poleR, 0, 360);

             let topText = layerName === "APD_Pole_New_9M" ? "NP9" : "NP7";
             let botText = "4\"";
             const upperName = safeName.toUpperCase();
             if (upperName.includes("3\"") || upperName.includes("3IN") || upperName.includes("3 IN") || upperName.includes("3'")) {
               botText = "3\"";
             }

             drawBoldText(d, x - 1.2, y + 0.3, 0.9, 0, topText);
             drawBoldText(d, x - 0.5, y - 0.8, 0.9, 0, botText);

             textX = x + 3;
             useDashSplitLabel = true;
             isVerticalPoleLabel = true;
         } else if (name.includes("sto")) {
             drawRectangle(d, x - 1.8, y - 2.6, x + 1.8, y + 2.6, 0.08);
             drawBoldText(d, x - 1, y + 0.5, 1.14, 0, "STO");
             drawBoldText(d, x - 1.5, y - 1, 0.51, 0, "TELKOM");
             textX = x + 3;
         } else {
             const s = 1.5;
             // @ts-ignore
             d.drawPolyline([[x, y + s],[x + s, y],[x, y - s],[x - s, y]], true);
             d.drawLine(x - s, y - s, x + s, y + s);
             d.drawLine(x - s, y + s, x + s, y - s);
             textX = x + 2;
             textY = y + 2;
         }

         if (fatLabelLayer) {
           d.setActiveLayer(fatLabelLayer);
         }

         const iconLabelRotation = isSlack ? 0 : (isVerticalPoleLabel ? POLE_LABEL_ROTATION_DEG : globalTextRotationDeg);
         
         if (fatLabelLayer) {
           drawFatInfoTable(d, x, y, safeName, fatLabelLayer, iconLabelRotation, 5, 3);
         } else if (useDashSplitLabel) {
           const poleLines = splitPoleNameLines(safeName);
           drawSmartMultilineLabel(d, x, y, 2, poleLines, textX - x, textY - y, iconLabelRotation);
         } else {
           let defOffsetX = textX - x;
           let defOffsetY = textY - y;
           
           if (isSlack) {
              const textWidth = estimateTextWidth(safeName, 2);
              defOffsetX = -textWidth - 3; 
              defOffsetY = -1; 
           }
           
           drawSmartLabel(d, x, y, 2, safeName, defOffsetX, defOffsetY, iconLabelRotation);
         }
      };

      const getFiberCoreCount = (name: string): number | null => {
        const upper = name.toUpperCase();
        const matchSlashTube = upper.match(/(\d+)\s*[\/\-]?\s*\d+\s*T\b/);
        if (matchSlashTube) return parseInt(matchSlashTube[1], 10);
        const matchC = upper.match(/(\d+)\s*C\b/);
        if (matchC) return parseInt(matchC[1], 10);
        const matchCore = upper.match(/(\d+)\s*(?:CORE|INTI)\b/);
        if (matchCore) return parseInt(matchCore[1], 10);
        const knownCoreCounts = [288, 144, 96, 72, 48, 24, 12];
        for (const core of knownCoreCounts) {
          if (new RegExp(`(?<!\\d)${core}(?!\\d)`).test(upper)) return core;
        }
        return null;
      };

      const getCableLayerForName = (name: string): string => {
        const core = getFiberCoreCount(name);
        if (core === null) return "APD_Cable_Default";
        const exact = FIBER_CORE_COLORS.find((c) => c.core === core);
        if (exact) return `APD_Cable_${exact.core}C`;
        let closest = FIBER_CORE_COLORS[0];
        let closestDiff = Math.abs(core - closest.core);
        for (const c of FIBER_CORE_COLORS) {
          const diff = Math.abs(core - c.core);
          if (diff < closestDiff) {
            closest = c;
            closestDiff = diff;
          }
        }
        return `APD_Cable_${closest.core}C`;
      };

      const getApdIconRadius = (category: PlacemarkCategory): number => {
        switch (category) {
          case "fdt": return 3;
          case "fat": return 3;
          case "existing_pole": return 1.8;
          case "new_pole": return 1.8;
          case "joint_closure": return 2;
          case "slack_hanger": return 1.9;
          default: return 1;
        }
      };

      const drawApdPointIcon = (d: any, x: number, y: number, rawName: string, category: PlacemarkCategory) => {
        const safeName = sanitizeDxfText(rawName) || "Unnamed";

        const apdIconRadius = getApdIconRadius(category);
        const adjustedPos = findClearIconPosition(x, y, apdIconRadius);
        x = adjustedPos.x;
        y = adjustedPos.y;

        let textOffsetX = 4;
        let textOffsetY = -2;
        let fatLabelLayer: string | null = null;
        let isSlack = false;

        if (category === "fdt") {
          d.setActiveLayer("APD_FDT");
          drawRectangle(d, x - 3, y - 1.7, x + 3, y + 1.7, 0.1);
          drawBoldText(d, x - 2.2, y - 0.8, 1.6, 0, "FDT");
          textOffsetX = 5;
        } else if (category === "fat") {
          const layerName = getFatLayer(safeName);
          d.setActiveLayer(layerName);
          const w = 4.0, h = 1.5;
          const border = 0.1;
          drawRectangle(d, x - w, y - h, x + w, y + h, border); 
          drawRectangle(d, x - (w - 0.3), y - (h - 0.3), x + (w - 0.3), y + (h - 0.3), border); 
          
          d.setActiveLayer("APD_FAT_YELLOW");
          // @ts-ignore
          d.drawFace(
              x - 3.2, y + 0.8, 0,
              x - 1.8, y, 0,
              x - 3.2, y - 0.8, 0,
              x - 3.2, y - 0.8, 0
          );
          
          d.setActiveLayer("APD_Label");
          drawBoldText(d, x - 1, y - 0.75, 1.8, 0, "16");
          
          textOffsetX = 5;
          fatLabelLayer = layerName;
        } else if (category === "existing_pole") {
          d.setActiveLayer("APD_Pole_Existing");
          const poleR = 1.8;
          d.drawArc(x, y, poleR, 0, 360);
          const crossOffset = poleR * Math.SQRT1_2;
          d.drawLine(x - crossOffset, y - crossOffset, x + crossOffset, y + crossOffset);
          d.drawLine(x - crossOffset, y + crossOffset, x + crossOffset, y - crossOffset);
          textOffsetX = 3;
        } else if (category === "new_pole") {
          const layerName = getNewPoleLayer(safeName);
          d.setActiveLayer(layerName);
          const poleR = 1.8;
          d.drawArc(x, y, poleR, 0, 360);

          let topText = layerName === "APD_Pole_New_9M" ? "NP9" : "NP7";
          let botText = "4\"";
          const upperName = safeName.toUpperCase();
          if (upperName.includes("3\"") || upperName.includes("3IN") || upperName.includes("3 IN") || upperName.includes("3'")) {
            botText = "3\"";
          }

          drawBoldText(d, x - 1.2, y + 0.3, 0.9, 0, topText);
          drawBoldText(d, x - 0.5, y - 0.8, 0.9, 0, botText);

          textOffsetX = 3;
        } else if (category === "joint_closure") {
          d.setActiveLayer("APD_Closure");
          // @ts-ignore
          d.drawPolyline([[x - 2, y - 1.2], [x, y], [x - 2, y + 1.2]], true);
          // @ts-ignore
          d.drawPolyline([[x + 2, y - 1.2], [x, y], [x + 2, y + 1.2]], true);
          textOffsetX = 4;
        } else if (category === "slack_hanger") {
          d.setActiveLayer("APD_SlackHanger");
          const scale = 0.65;
          const pts = [
              [x, y],
              [x + 1.2*scale, y + 1.2*scale],
              [x + 2.5*scale, y + 1.5*scale],
              [x + 3.8*scale, y + 1.2*scale],
              [x + 4.5*scale, y],
              [x + 3.8*scale, y - 1.2*scale],
              [x + 2.5*scale, y - 1.5*scale],
              [x + 1.2*scale, y - 1.2*scale],
              [x, y],
              [x - 1.2*scale, y - 1.2*scale],
              [x - 2.5*scale, y - 1.5*scale],
              [x - 3.8*scale, y - 1.2*scale],
              [x - 4.5*scale, y],
              [x - 3.8*scale, y + 1.2*scale],
              [x - 2.5*scale, y + 1.5*scale],
              [x - 1.2*scale, y + 1.2*scale],
              [x, y]
          ];
          // @ts-ignore
          d.drawPolyline(pts, true);
          isSlack = true; 
        } else {
          d.setActiveLayer("APD_Label");
          d.drawArc(x, y, 1, 0, 360);
          textOffsetX = 3;
        }

        if (fatLabelLayer) {
          d.setActiveLayer(fatLabelLayer);
        }

        const isPoleCategory = category === "existing_pole" || category === "new_pole";
        
        const labelRotation = isSlack ? 0 : (isPoleCategory ? POLE_LABEL_ROTATION_DEG : globalTextRotationDeg);
        
        if (fatLabelLayer) {
          drawFatInfoTable(d, x, y, safeName, fatLabelLayer, globalTextRotationDeg, 5, 3);
        } else if (isPoleCategory || category === "fdt") {
          const poleLines = splitPoleNameLines(safeName);
          drawSmartMultilineLabel(d, x, y, 1.8, poleLines, textOffsetX, textOffsetY, labelRotation);
        } else {
          let defOffsetX = textOffsetX;
          let defOffsetY = textOffsetY;
          
          if (isSlack) {
             const textWidth = estimateTextWidth(safeName, 1.8);
             defOffsetX = -textWidth - 3;
             defOffsetY = -0.9;
          }
          
          drawSmartLabel(d, x, y, 1.8, safeName, defOffsetX, defOffsetY, labelRotation);
        }
      };

      type HomepassPoint = { x: number; y: number; rawName: string; category: PlacemarkCategory };
      const homepassPoints: HomepassPoint[] = [];

      placemarkEntries.forEach(({ placemark: p, isHomepass, category }) => {
        const name = getPlacemarkName(p);
        const geoms = collectGeometries(p);

        geoms.forEach((g) => {
          if (g.kind === "Point") {
            const coords = g.coordinates.trim().split(",");
            if (coords.length >= 2) {
              const prj = projKml(parseFloatVal(coords[0]) || 0, parseFloatVal(coords[1]) || 0);
              if (isHomepass) {
                homepassPoints.push({ x: prj.x, y: prj.y, rawName: name, category });
              } else if (
                category === "fdt" ||
                category === "fat" ||
                category === "existing_pole" ||
                category === "new_pole" ||
                category === "joint_closure" ||
                category === "slack_hanger"
              ) {
                drawApdPointIcon(d, prj.x, prj.y, name, category);
              } else {
                d.setActiveLayer("KML_Points");
                drawIcon(d, prj.x, prj.y, name);
              }
            }
            return;
          }

          const rawCoords = g.coordinates.trim().split(/\s+/);
          const pts: [number, number][] = rawCoords.map((c: string) => {
             const parts = c.split(",");
             const prj = projKml(parseFloatVal(parts[0]) || 0, parseFloatVal(parts[1]) || 0);
             return [prj.x, prj.y];
          });

          if (pts.length > 1) {
             const closed = g.kind === "Polygon";

             if (category === "cable" || category === "cable_subfeeder") {
                d.setActiveLayer(getCableLayerForName(name));
                // @ts-ignore
                d.drawPolyline(pts, closed);
                return;
             }
             if (category === "sling_wire") {
                d.setActiveLayer("APD_SlingWire");
                // @ts-ignore
                d.drawPolyline(pts, closed);
                return;
             }
             if (category === "fat_boundary") {
                d.setActiveLayer("APD_FAT_Boundary");
                // @ts-ignore
                d.drawPolyline(pts, closed);
                drawSmartLabel(d, pts[0][0], pts[0][1], 1.4, sanitizeDxfText(name), 0, 2, globalTextRotationDeg);
                return;
             }
             if (category === "boundary_cluster") {
                d.setActiveLayer("APD_BoundaryCluster");
                // @ts-ignore
                d.drawPolyline(pts, closed);
                drawSmartLabel(d, pts[0][0], pts[0][1], 1.6, sanitizeDxfText(name), 0, 2, globalTextRotationDeg);
                return;
             }

             const upperName = name.toUpperCase();
             let layerSet = false;
             for (let i = 1; i <= 12; i++) {
                const code = `D.${i.toString().padStart(2, '0')}`;
                if (upperName.includes(code)) {
                   d.setActiveLayer(`KML_${code}`);
                   layerSet = true;
                   break;
                }
             }
             if (!layerSet) {
                 const matchSuffix = upperName.match(/(\d{2})$/);
                 if (matchSuffix) {
                    const codeStr = `D.${matchSuffix[1]}`;
                    const num = parseInt(matchSuffix[1], 10);
                    if (num >= 1 && num <= 12) {
                       d.setActiveLayer(`KML_${codeStr}`);
                       layerSet = true;
                    }
                 }
             }
             if (!layerSet) d.setActiveLayer("KML_Default");

             // @ts-ignore
             d.drawPolyline(pts, closed);
          }
        });
      });

      homepassPoints.forEach(p => {
          drawHouseMarker(d, p.x, p.y, p.rawName, p.category);
      });

      if (minLon !== Infinity && minLat !== Infinity) {
        const padLon = (maxLon - minLon) * 0.1 || 0.002;
        const padLat = (maxLat - minLat) * 0.1 || 0.002;

        const b1 = proj(minLon - padLon, minLat - padLat);
        const b2 = proj(maxLon + padLon, minLat - padLat);
        const b3 = proj(maxLon + padLon, maxLat + padLat);
        const b4 = proj(minLon - padLon, maxLat + padLat);

        d.setActiveLayer("KML_Default");
        // @ts-ignore
        d.drawPolyline([[b1.x, b1.y], [b2.x, b2.y], [b3.x, b3.y], [b4.x, b4.y], [b1.x, b1.y]], true);
        drawSmartLabel(d, b4.x, b4.y, 2, "BOUNDARY_AREA", 0, 5);
      }

      const dxfContent = d.toDxfString();
      const outputName = `hasil_${req.file.originalname.replace(/\.kml$/i, ".dxf")}`;

      res.setHeader("Content-Disposition", `attachment; filename="${outputName}"`);
      res.setHeader("Content-Type", "application/dxf");
      res.send(dxfContent);

      fs.unlinkSync(req.file.path);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Gagal memproses KML ke DXF: " + err.message });
    }
  });


  // === 5. ENDPOINT KML TO CSV ===
  const detectGeometryTypeCsv = (p: any): string => {
    if (p.MultiGeometry) return "MultiGeometry";
    if (p.Point) return "Point";
    if (p.LineString) return "LineString";
    if (p.Polygon) return "Polygon";
    return "Unknown";
  };

  const geomToWktPart = (g: { kind: string; coordinates: string }): string => {
    const pairs = g.coordinates.trim().split(/\s+/).filter(Boolean).map((c) => {
      const parts = c.split(",");
      return `${parts[0]} ${parts[1]}`;
    });
    if (g.kind === "Point") return `POINT(${pairs[0]})`;
    if (g.kind === "LineString") return `LINESTRING(${pairs.join(", ")})`;
    if (g.kind === "Polygon") return `POLYGON((${pairs.join(", ")}))`;
    return "";
  };

  const geomsToWkt = (geoms: { kind: string; coordinates: string }[]): string => {
    if (geoms.length === 0) return "";
    if (geoms.length === 1) return geomToWktPart(geoms[0]);
    return `GEOMETRYCOLLECTION(${geoms.map(geomToWktPart).join(", ")})`;
  };

  const parseDescriptionKV = (desc: string): Record<string, string> => {
    const result: Record<string, string> = {};
    if (!desc) return result;
    const clean = desc.replace(/<(?!br\s*\/?\s*>)[^>]*>/gi, "");
    const lines = clean.split(/<br\s*\/?>/i);
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const idx = line.indexOf(":");
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key) result[key] = val;
      }
    }
    return result;
  };

  app.post("/api/kml-to-csv", upload.single("file"), (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const kmlContent = fs.readFileSync(req.file.path, "utf-8");
      const parser = new XMLParser(KML_PARSER_OPTIONS);
      const jsonObj = parser.parse(kmlContent);

      const placemarkEntries = extractPlacemarks(jsonObj.kml || jsonObj);

      const allKeys: string[] = ["PlacemarkName", "GeometryType"];
      const rows: { name: string; geometryType: string; wkt: string; descData: Record<string, string> }[] = [];

      placemarkEntries.forEach(({ placemark: p }) => {
        const name = getPlacemarkName(p);
        const geometryType = detectGeometryTypeCsv(p);
        const geoms = collectGeometries(p);
        const wkt = geomsToWkt(geoms);
        const desc = p.description !== undefined && p.description !== null ? String(p.description) : "";
        const descData = parseDescriptionKV(desc);

        Object.keys(descData).forEach((k) => {
          if (!allKeys.includes(k)) allKeys.push(k);
        });

        rows.push({ name, geometryType, wkt, descData });
      });

      const header = [...allKeys, "WKT"].map((k) => ({ id: k, title: k }));
      const csvStringifier = createObjectCsvStringifier({ header });

      const records = rows.map((r) => {
        const record: Record<string, string> = {};
        allKeys.forEach((k) => {
          if (k === "PlacemarkName") record[k] = r.name;
          else if (k === "GeometryType") record[k] = r.geometryType;
          else record[k] = r.descData[k] ?? "";
        });
        record.WKT = r.wkt;
        return record;
      });

      const csvContent = "\uFEFF" + csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
      const outputName = req.file.originalname.replace(/\.kml$/i, ".csv");

      res.setHeader("Content-Disposition", `attachment; filename="${outputName}"`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csvContent);

      fs.unlinkSync(req.file.path);
    } catch (err: any) {
      console.error("Error /api/kml-to-csv:", err);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      res.status(500).json({ error: "Gagal memproses KML ke CSV: " + err.message });
    }
  });

  // === 6a. STATE & HELPERS UNTUK FILE REFERENSI (ENRICHMENT) ===
  let referenceIndex: any[] = [];
  let referenceStats = { totalRows: 0, skipped: 0, lastUpdated: null as string | null };
  let rawReferenceBuffer: Buffer | null = null;
  let rawReferenceExt: string | null = null;

  function buildReferenceIndex(rows: any[], filename: string) {
    let skipped = 0;
    let indexed = 0;

    if (rows.length === 0) return { totalRows: 0, skipped: 0 };

    const keys = Object.keys(rows[0]).map(k => k.toLowerCase().trim());
    const findKey = (candidates: string[]) => {
      for (const c of candidates) {
        const idx = keys.indexOf(c);
        if (idx !== -1) return Object.keys(rows[0])[idx];
      }
      return null;
    };

    const kCableSheath = findKey(['cable sheath', 'kode cable sheath', 'cable sheath code']);
    const kStartLocn = findKey(['cable sheath start locn', 'start locn', 'odc locn', 'odc']);
    const kEndLocn = findKey(['odp name', 'odp', 'odp_name', 'nama odp', 'cable sheath end locn', 'nama titik', 'titik', 'name', 'nama']);
    const kLat = findKey(['latitude', 'lat', 'y', 'lintang']);
    const kLon = findKey(['longitude', 'lon', 'long', 'x', 'bujur']);
    const kGeom = findKey(['geometry', 'geom', 'cable sheath elocn geom', 'wkt', 'koordinat']);
    const kLineGeom = findKey(['cable sheath geometry', 'route geometry', 'line geometry', 'jalur', 'linestring']);

    referenceIndex = rows.map(r => {
      const cableSheath = kCableSheath ? String(r[kCableSheath] || '').trim() : undefined;
      const startLocn = kStartLocn ? String(r[kStartLocn] || '').trim() : undefined;
      const endLocn = kEndLocn ? String(r[kEndLocn] || '').trim() : undefined;

      if (!cableSheath && !endLocn) {
        skipped++;
        return null;
      }

      let endLat = null;
      let endLon = null;
      let lineCoords = null;

      if (kLat && kLon) {
        endLat = parseFloatVal(r[kLat]);
        endLon = parseFloatVal(r[kLon]);
      }
      
      // Point WKT Fallback
      if ((endLat === null || endLon === null) && kGeom && r[kGeom]) {
        const wktStr = String(r[kGeom]).trim().toUpperCase();
        if (wktStr.startsWith('POINT')) {
          const match = wktStr.match(/\((.*?)\)/);
          if (match) {
            const coords = match[1].replace(/,/g, ' ').trim().split(/\s+/);
            if (coords.length >= 2) {
              let parsedLon = parseFloatVal(coords[0]);
              let parsedLat = parseFloatVal(coords[1]);
              if (parsedLon !== null && parsedLat !== null) {
                if (Math.abs(parsedLat) > 90 && Math.abs(parsedLon) <= 90) {
                  endLon = parsedLat; endLat = parsedLon;
                } else {
                  endLon = parsedLon; endLat = parsedLat;
                }
              }
            }
          }
        }
      }

      // Auto-swap safety check
      if (endLat !== null && endLon !== null) {
        if (Math.abs(endLat) > 90 && Math.abs(endLon) <= 90) {
          const t = endLat; endLat = endLon; endLon = t;
        }
      }

      // LineString WKT Parsing
      if (kLineGeom && r[kLineGeom]) {
        const wktLineStr = String(r[kLineGeom]).trim().toUpperCase();
        if (wktLineStr.startsWith('LINESTRING') || wktLineStr.startsWith('MULTILINESTRING')) {
          const match = wktLineStr.match(/\((.*)\)/);
          if (match) {
            const rawPairs = match[1].replace(/[()]/g, '').split(',');
            const validPairs = [];
            for (const pair of rawPairs) {
              const coords = pair.trim().split(/\s+/);
              if (coords.length >= 2) {
                let lon = parseFloatVal(coords[0]);
                let lat = parseFloatVal(coords[1]);
                if (lon !== null && lat !== null) {
                  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) validPairs.push(`${lat},${lon},0`);
                  else validPairs.push(`${lon},${lat},0`);
                }
              }
            }
            if (validPairs.length >= 2) lineCoords = validPairs.join(' ');
          }
        }
      }

      indexed++;
      return { cableSheath, startLocn, endLocn, endLat, endLon, lineCoords };
    }).filter(Boolean);

    referenceStats = { totalRows: indexed, skipped, lastUpdated: new Date().toISOString() };
    return referenceStats;
  }

  function persistRawReferenceFile(buffer: Buffer, ext: string) {
    rawReferenceBuffer = buffer;
    rawReferenceExt = ext;
  }

  function getReferenceStats() {
    return referenceStats;
  }

  function isReferenceLoaded() {
    return referenceIndex.length > 0;
  }

  function lookupReference(criteria: { cableSheath?: string, startLocn?: string, endLocn?: string }) {
    if (criteria.cableSheath) {
      const hit = referenceIndex.find(r => r.cableSheath && r.cableSheath === criteria.cableSheath);
      if (hit) return { tier: 'cable_sheath', record: hit };
    }
    if (criteria.startLocn && criteria.endLocn) {
      const hit = referenceIndex.find(r => r.startLocn === criteria.startLocn && r.endLocn === criteria.endLocn);
      if (hit) return { tier: 'start_end', record: hit };
    }
    if (criteria.endLocn) {
      const hit = referenceIndex.find(r => r.endLocn === criteria.endLocn);
      if (hit) return { tier: 'end_locn', record: hit };
    }
    return null;
  }


  // === 6b. ENDPOINT: Upload / update file referensi ===
  app.post('/api/reference/upload', uploadMemory.single('referenceFile'), async (req: any, res: any) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'File referensi wajib diunggah!' });
      }

      const ext = (file.originalname.split('.').pop() || '').toLowerCase();
      let rows: any[];

      if (ext === 'csv') {
        const csvText = file.buffer.toString('utf8');
        const delimiter = detectCsvDelimiter(csvText);
        rows = parseCsvSync(csvText, {
          columns: true, skip_empty_lines: true, relax_column_count: true, bom: true, trim: true, delimiter,
        });
      } else {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      }

      const { totalRows, skipped } = buildReferenceIndex(rows, file.originalname);
      persistRawReferenceFile(file.buffer, ext);

      return res.json({
        success: true,
        message: `Referensi berhasil diupdate: ${totalRows} baris terindeks (${skipped} baris dilewati karena kosong).`,
        stats: getReferenceStats(),
      });
    } catch (error: any) {
      console.error('Error Upload Reference:', error);
      return res.status(500).json({ success: false, message: error.message || 'Gagal memproses file referensi.' });
    }
  });


  // === 6c. ENDPOINT: Cek status file referensi ===
  app.get('/api/reference/status', (req: any, res: any) => {
    if (!isReferenceLoaded()) {
      return res.json({ success: true, loaded: false, message: 'Belum ada file referensi yang diupload.' });
    }
    return res.json({ success: true, loaded: true, stats: getReferenceStats() });
  });

// === Endpoint: Create LOP ===
// Membangun titik ODC/ODP dan jalur kabel (KML) dari file ODP + file
// referensi (opsional). Jalur ditelusuri sbg rantai ODC -> ODP lewat kolom
// CABLE SHEATH START/END LOCN & ODC LOCN pada file referensi, tiap hop
// digambar sbg segmen terpisah. Output: satu .kml gabungan, atau .zip berisi
// 3 file per LOP (ODC.kml, ODP.kml, Jalur Kabel.kml) + BOQ.

const LOP_CATEGORIES: Record<string, { name: string }> = {
  'PT2-UNLOCK': { name: 'PT2-Unlock' },
  'PT2-EXPAND': { name: 'PT2-Expand' },
  'PT2-RAPID': { name: 'PT2-Rapid' },
  'PT2-OSP': { name: 'PT2-OSP' },
  'OPSIONAL': { name: 'Opsional' },
};

const boqFieldName = (categoryKey: string) => 'boq_' + categoryKey.toLowerCase().replace(/-/g, '_');

const MAX_CHAIN_HOPS = 300; // batas pengaman jumlah hop saat menelusuri rantai

type LinePair = [number, number]; // [lon, lat]

const keyOf = (s: string) => s.trim().toUpperCase(); // kunci pencocokan nama (trim+uppercase); nama asli tetap dipakai utk label

// Token "tidak diketahui" pada data referensi (unset/-/null/dst) dianggap kosong,
// bukan nama titik yang sah -- mencegah placemark/garis "ngawur" bernama literal "unset".
const isPlaceholderName = (s: string) => {
  const t = s.trim().toLowerCase();
  return t === '' || t === '-' || t === 'unset' || t === 'null' || t === 'n/a' || t === 'none';
};
const normalizeName = (s: string) => (isPlaceholderName(s) ? '' : s.trim());

interface CableSegmentRef {
  startName: string;
  startLat: number | null;
  startLon: number | null;
  endName: string;
  endLat: number | null;
  endLon: number | null;
  rawLinePairs: LinePair[] | null; // belum diorientasikan
  odcRoot: string;
  sheathCode: string;
}

interface ChainHop {
  startName: string;
  startLat: number | null;
  startLon: number | null;
  endName: string;
  endLat: number | null;
  endLon: number | null;
  linePairs: LinePair[] | null;
  sheathCode: string;
}

app.post('/api/create-lop', (req: any, res: any, next: any) => {
  uploadMemory.any()(req, res, (err: any) => {
    if (err) {
      console.error('--- MULTER ERROR TERTANGKAP ---');
      console.error(err);
      return res.status(500).json({
        success: false,
        message: `Gagal Upload File (Multer): ${err.message}. Coba periksa nama field di Inspect Element.`,
      });
    }
    next();
  });
}, async (req: any, res: any) => {
  try {
    const files: { [fieldname: string]: Express.Multer.File[] } = {};
    if (Array.isArray(req.files)) {
      req.files.forEach((f: Express.Multer.File) => {
        if (!files[f.fieldname]) files[f.fieldname] = [];
        files[f.fieldname].push(f);
      });
    }

    // --- Koordinat POINT: nilai eksplisit yg valid tidak ditimpa, geometry WKT hanya mengisi yg kosong ---
    const extractPointCoords = (latVal: any, lonVal: any, geomVal: any) => {
      let lat = parseFloatVal(latVal);
      let lon = parseFloatVal(lonVal);
      if ((lat === null || lon === null) && geomVal) {
        const wktStr = String(geomVal).trim().toUpperCase();
        if (wktStr.startsWith('POINT')) {
          const match = wktStr.match(/\((.*?)\)/);
          if (match) {
            const coords = match[1].replace(/,/g, ' ').trim().split(/\s+/);
            if (coords.length >= 2) {
              const parsedLon = parseFloatVal(coords[0]);
              const parsedLat = parseFloatVal(coords[1]);
              if (parsedLon !== null && parsedLat !== null) {
                let finalLon = parsedLon;
                let finalLat = parsedLat;
                if (Math.abs(parsedLat) > 90 && Math.abs(parsedLon) <= 90) {
                  finalLon = parsedLat; finalLat = parsedLon; // tertukar di sumber data
                }
                if (lat === null) lat = finalLat;
                if (lon === null) lon = finalLon;
              }
            }
          }
        }
      }
      return { lat, lon };
    };

    // Parse satu daftar "lon lat, lon lat, ..." jadi LinePair[], dgn deteksi lat/lon tertukar per-titik.
    const parsePointList = (raw: string): LinePair[] => {
      const out: LinePair[] = [];
      for (const pair of raw.split(',')) {
        const coords = pair.trim().split(/\s+/);
        if (coords.length < 2) continue;
        const lon = parseFloatVal(coords[0]);
        const lat = parseFloatVal(coords[1]);
        if (lon === null || lat === null) continue;
        if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) out.push([lat, lon]); // tertukar di sumber data
        else out.push([lon, lat]);
      }
      return out;
    };

    // --- LINESTRING / MULTILINESTRING -> LinePair[] mentah (belum diorientasikan) ---
    // Untuk MULTILINESTRING, tiap sub-path diparse terpisah lalu dipilih yg vertex-nya
    // TERBANYAK (diasumsikan jalur utama) -- menghindari sub-path "nyasar"/pendek ikut
    // tergabung jadi satu garis panjang yang melompat-lompat.
    const extractLinePairs = (lineGeomVal: any): LinePair[] | null => {
      if (!lineGeomVal) return null;
      const wktLineStr = String(lineGeomVal).trim().toUpperCase();
      const isMulti = wktLineStr.startsWith('MULTILINESTRING');
      if (!isMulti && !wktLineStr.startsWith('LINESTRING')) return null;

      const match = wktLineStr.match(/\((.*)\)/);
      if (!match) return null;
      const inner = match[1];

      if (isMulti) {
        const subParts = inner.split(/\)\s*,\s*\(/).map(p => p.replace(/[()]/g, ''));
        let best: LinePair[] = [];
        for (const part of subParts) {
          const pts = parsePointList(part);
          if (pts.length > best.length) best = pts;
        }
        return best.length >= 2 ? best : null;
      }

      const pts = parsePointList(inner.replace(/[()]/g, ''));
      return pts.length >= 2 ? pts : null;
    };

    // Orientasikan garis berdasarkan titik ujung (end) yg SUDAH diketahui koordinatnya --
    // lebih andal drpd kolom "start locn" yg sering kosong pada titik perantara.
    const orientLineByKnownEnd = (
      pairs: LinePair[] | null,
      endLat: number | null,
      endLon: number | null,
    ): LinePair[] | null => {
      if (!pairs || pairs.length < 2 || endLat === null || endLon === null) return pairs;
      const [firstLon, firstLat] = pairs[0];
      const [lastLon, lastLat] = pairs[pairs.length - 1];
      const dFirst = (firstLon - endLon) ** 2 + (firstLat - endLat) ** 2;
      const dLast = (lastLon - endLon) ** 2 + (lastLat - endLat) ** 2;
      return dFirst < dLast ? [...pairs].reverse() : pairs;
    };

    const snapLineEndpoints = (
      pairs: LinePair[] | null,
      startLat: number | null,
      startLon: number | null,
      endLat: number | null,
      endLon: number | null,
    ): LinePair[] | null => {
      if (!pairs || pairs.length < 2) return pairs;
      const out = [...pairs];
      if (startLat !== null && startLon !== null) out[0] = [startLon, startLat];
      if (endLat !== null && endLon !== null) out[out.length - 1] = [endLon, endLat];
      return out;
    };

    // Buang geometry yg "ngawur": kalau ada vertex yg jauh dari KEDUA ujung (start & end)
    // dibanding jarak lurus start->end, kemungkinan besar LINESTRING ini salah pasangan/data
    // korup -- lebih baik fallback ke garis lurus drpd menampilkan rute melompat-lompat.
    const approxDistDeg = (lat1: number, lon1: number, lat2: number, lon2: number) =>
      Math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2);

    const sanitizeLine = (
      pairs: LinePair[] | null,
      startLat: number | null,
      startLon: number | null,
      endLat: number | null,
      endLon: number | null,
    ): LinePair[] | null => {
      if (!pairs || pairs.length < 2) return pairs;
      if (startLat === null || startLon === null || endLat === null || endLon === null) return pairs;
      const straight = approxDistDeg(startLat, startLon, endLat, endLon);
      const maxAllowed = Math.max(straight * 3, 0.01); // toleransi: 3x jarak lurus, min ~1.1km
      const detour = pairs.reduce((max, [lon, lat]) => {
        const d = Math.min(approxDistDeg(lat, lon, startLat, startLon), approxDistDeg(lat, lon, endLat, endLon));
        return Math.max(max, d);
      }, 0);
      return detour > maxAllowed ? null : pairs;
    };

    const pairsToKmlCoordString = (pairs: LinePair[]) =>
      pairs.map(([lon, lat]) => `${lon},${lat},0`).join(' ');

    if (!files || !files.odp || files.odp.length === 0) {
      return res.status(400).json({ success: false, message: 'File Data ODP/CSV wajib diunggah!' });
    }

    const odpFile = files.odp[0];
    const mode = req.body.mode || 'kml';
    const docName = req.body.docname ? req.body.docname.trim().substring(0, 100) : 'Export';
    const iconUrl = AVAILABLE_ICONS[req.body.icon] || AVAILABLE_ICONS['U'];

    // Titik ODC pakai icon segitiga kuning terpisah supaya beda dari ODP/closure lain.
    const ODC_ICON_HREF = 'http://maps.google.com/mapfiles/kml/shapes/triangle.png';
    const odcStyleBlock =
      `    <Style id="odcIconStyle">\n      <IconStyle>\n        <color>ff00ffff</color>\n        <Icon><href>${ODC_ICON_HREF}</href></Icon>\n        <hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/>\n      </IconStyle>\n    </Style>\n`;
    const iconStyleBlock =
      `    <Style id="iconStyle">\n      <IconStyle>\n        <Icon><href>${iconUrl}</href></Icon>\n        <hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/>\n      </IconStyle>\n    </Style>\n`;
    const cableStyleBlock =
      `    <Style id="cableStyle">\n      <LineStyle>\n        <color>ffff0000</color>\n        <width>3</width>\n      </LineStyle>\n    </Style>\n`;
    const isOdcName = (name: string) => /^ODC/i.test(name);

    const drawCable = req.body.drawCable !== 'false';
    const useReference = req.body.useReference !== 'false';

    // =====================================================================
    // 1. FILE REFERENSI -> peta segmen kabel (kunci pencocokan dinormalisasi)
    // =====================================================================
    const segByCableSheath = new Map<string, CableSegmentRef>();
    const segByEndLocn = new Map<string, CableSegmentRef[]>();
    const odcCoordsByName = new Map<string, { lat: number | null; lon: number | null }>();

    let localRefLoaded = false;
    let ambiguousEndLocnCount = 0;

    let referenceFile: Express.Multer.File | undefined = undefined;
    if (files.reference && files.reference.length > 0) {
      referenceFile = files.reference[0];
    } else {
      const possibleRefKeys = Object.keys(files).filter(k => k !== 'odp' && !k.startsWith('boq_'));
      if (possibleRefKeys.length > 0) referenceFile = files[possibleRefKeys[0]][0];
    }

    if (useReference && referenceFile) {
      const refExt = (referenceFile.originalname.split('.').pop() || '').toLowerCase();
      let refRows: any[] = [];

      if (refExt === 'csv') {
        const csvText = referenceFile.buffer.toString('utf8');
        const delimiter = detectCsvDelimiter(csvText);
        refRows = parseCsvSync(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true, trim: true, delimiter });
      } else {
        const workbook = XLSX.read(referenceFile.buffer, { type: 'buffer' });
        refRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      }

      if (refRows.length > 0) {
        const refKeys = Object.keys(refRows[0]).map(k => k.toLowerCase().trim());
        const findRefKey = (candidates: string[]) => {
          for (const c of candidates) {
            const idx = refKeys.indexOf(c);
            if (idx !== -1) return Object.keys(refRows[0])[idx];
          }
          return null;
        };

        const krEnd = findRefKey(['cable sheath end locn', 'end locn', 'odp name', 'odp', 'nama odp', 'nama titik', 'titik', 'name', 'nama']);
        const krEndGeom = findRefKey(['cable sheath elocn geom', 'end geom', 'geometry', 'geom', 'wkt', 'koordinat']);
        const krLat = findRefKey(['latitude', 'lat', 'y', 'lintang']);
        const krLon = findRefKey(['longitude', 'lon', 'long', 'x', 'bujur']);
        const krStart = findRefKey(['cable sheath start locn', 'start locn']);
        const krStartGeom = findRefKey(['cable sheath slocn geom', 'slocn geom', 'start geom']);
        const krStartLat = findRefKey(['cable sheath slocn lat', 'slocn lat', 'start lat']);
        const krStartLon = findRefKey(['cable sheath slocn lon', 'slocn lon', 'start lon']);
        const krOdcRoot = findRefKey(['odc locn', 'odc', 'nama odc']);
        const krOdcGeom = findRefKey(['odc geom']);
        const krOdcLat = findRefKey(['odc lat', 'latitude odc', 'lat odc']);
        const krOdcLon = findRefKey(['odc lon', 'longitude odc', 'lon odc']);
        const krSheath = findRefKey(['cable sheath', 'kode cable sheath', 'cable sheath code']);
        const krLineGeom = findRefKey(['cable sheath geometry', 'route geometry', 'line geometry', 'jalur', 'linestring']);

        refRows.forEach(row => {
          const endValRaw = krEnd ? String(row[krEnd] || '').trim() : '';
          if (isPlaceholderName(endValRaw)) return;
          const endVal = endValRaw;

          const startValRaw = (krStart ? String(row[krStart] || '').trim() : '') || (krOdcRoot ? String(row[krOdcRoot] || '').trim() : '');
          const startVal = normalizeName(startValRaw);
          const startCoords = extractPointCoords(krStartLat ? row[krStartLat] : null, krStartLon ? row[krStartLon] : null, krStartGeom ? row[krStartGeom] : null);
          const endCoords = extractPointCoords(krLat ? row[krLat] : null, krLon ? row[krLon] : null, krEndGeom ? row[krEndGeom] : null);
          const rawLinePairs = extractLinePairs(krLineGeom ? row[krLineGeom] : null);
          const sheathVal = krSheath ? String(row[krSheath] || '').trim() : '';
          const odcRootVal = normalizeName(krOdcRoot ? String(row[krOdcRoot] || '').trim() : '');

          if (odcRootVal) {
            const odcCoords = extractPointCoords(krOdcLat ? row[krOdcLat] : null, krOdcLon ? row[krOdcLon] : null, krOdcGeom ? row[krOdcGeom] : null);
            const k = keyOf(odcRootVal);
            if (odcCoords.lat !== null && odcCoords.lon !== null && !odcCoordsByName.has(k)) odcCoordsByName.set(k, odcCoords);
          }

          const record: CableSegmentRef = {
            startName: startVal, startLat: startCoords.lat, startLon: startCoords.lon,
            endName: endVal, endLat: endCoords.lat, endLon: endCoords.lon,
            rawLinePairs, odcRoot: odcRootVal, sheathCode: sheathVal,
          };

          if (sheathVal) {
            const sk = keyOf(sheathVal);
            if (!segByCableSheath.has(sk)) segByCableSheath.set(sk, record);
          }

          const ek = keyOf(endVal);
          const existing = segByEndLocn.get(ek);
          if (existing) {
            existing.push(record);
            if (existing.length === 2) ambiguousEndLocnCount++;
          } else {
            segByEndLocn.set(ek, [record]);
          }
        });
        localRefLoaded = true;
      }
    }

    // =====================================================================
    // 2. PENELUSURAN RANTAI ODC -> ODP (per segmen)
    // =====================================================================
    type ChainStatus = 'REACHED_ODC' | 'PARTIAL' | 'NOT_FOUND' | 'CYCLE' | 'MAX_HOPS' | 'UNKNOWN_START';

    const sameName = (a: string, b: string) => !!a && !!b && keyOf(a) === keyOf(b);

    const pickBestCandidate = (candidates: CableSegmentRef[], preferredOdcRoot: string): CableSegmentRef => {
      if (candidates.length === 1) return candidates[0];
      return candidates.find(c => c.odcRoot && preferredOdcRoot && sameName(c.odcRoot, preferredOdcRoot)) || candidates[0];
    };

    const buildChain = (
      targetName: string, targetLat: number | null, targetLon: number | null, cableSheathCode: string,
    ): { hops: ChainHop[]; status: ChainStatus; entryTier: 'cable_sheath' | 'end_locn' | 'none' } => {
      let entrySeg: CableSegmentRef | undefined;
      let entryTier: 'cable_sheath' | 'end_locn' | 'none' = 'none';

      if (cableSheathCode && segByCableSheath.has(keyOf(cableSheathCode))) {
        entrySeg = segByCableSheath.get(keyOf(cableSheathCode));
        entryTier = 'cable_sheath';
      } else if (targetName && segByEndLocn.has(keyOf(targetName))) {
        entrySeg = pickBestCandidate(segByEndLocn.get(keyOf(targetName))!, '');
        entryTier = 'end_locn';
      }
      if (!entrySeg) return { hops: [], status: 'NOT_FOUND', entryTier: 'none' };

      const entryOdcRoot = entrySeg.odcRoot;
      const hops: ChainHop[] = [];
      const visitedKeys = new Set<string>([keyOf(targetName)]);
      let currentEndName = targetName;
      let currentEndLat = targetLat;
      let currentEndLon = targetLon;
      let currentSeg: CableSegmentRef = entrySeg;
      let status: ChainStatus = 'PARTIAL';
      let hopCount = 0;

      while (true) {
        if (!currentSeg.startName) { status = 'UNKNOWN_START'; break; }

        const endLat = currentEndLat ?? currentSeg.endLat;
        const endLon = currentEndLon ?? currentSeg.endLon;
        const oriented = orientLineByKnownEnd(currentSeg.rawLinePairs, endLat, endLon);

        let startLat = currentSeg.startLat;
        let startLon = currentSeg.startLon;
        if ((startLat === null || startLon === null) && oriented && oriented.length >= 2) {
          if (startLat === null) startLat = oriented[0][1];
          if (startLon === null) startLon = oriented[0][0];
        }

        let linePairs = snapLineEndpoints(oriented, startLat, startLon, endLat, endLon);
        linePairs = sanitizeLine(linePairs, startLat, startLon, endLat, endLon);

        hops.push({ startName: currentSeg.startName, startLat, startLon, endName: currentEndName, endLat, endLon, linePairs, sheathCode: currentSeg.sheathCode });
        hopCount++;

        const reachedOdc =
          (!!currentSeg.odcRoot && sameName(currentSeg.startName, currentSeg.odcRoot)) ||
          isOdcName(currentSeg.startName);

        if (reachedOdc) {
          const preciseOdc = odcCoordsByName.get(keyOf(currentSeg.startName)) || (currentSeg.odcRoot ? odcCoordsByName.get(keyOf(currentSeg.odcRoot)) : undefined);
          if (preciseOdc && preciseOdc.lat !== null && preciseOdc.lon !== null) {
            const lastHop = hops[hops.length - 1];
            lastHop.startLat = preciseOdc.lat;
            lastHop.startLon = preciseOdc.lon;
            lastHop.linePairs = snapLineEndpoints(lastHop.linePairs, preciseOdc.lat, preciseOdc.lon, lastHop.endLat, lastHop.endLon);
          }
          status = 'REACHED_ODC';
          break;
        }
        if (hopCount >= MAX_CHAIN_HOPS) { status = 'MAX_HOPS'; break; }
        const startKey = keyOf(currentSeg.startName);
        if (visitedKeys.has(startKey)) { status = 'CYCLE'; break; }
        visitedKeys.add(startKey);

        const candidates = segByEndLocn.get(startKey);
        if (!candidates || candidates.length === 0) { status = 'PARTIAL'; break; }

        currentEndName = currentSeg.startName;
        currentEndLat = startLat;
        currentEndLon = startLon;
        currentSeg = pickBestCandidate(candidates, entryOdcRoot);
      }

      hops.reverse();
      return { hops, status, entryTier };
    };

    // =====================================================================
    // 3. FILE ODP UTAMA (titik tujuan)
    // =====================================================================
    const odpExt = (odpFile.originalname.split('.').pop() || '').toLowerCase();
    let rows: any[];

    if (odpExt === 'csv') {
      const csvText = odpFile.buffer.toString('utf8');
      const delimiter = detectCsvDelimiter(csvText);
      rows = parseCsvSync(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true, trim: true, delimiter });
    } else {
      const workbook = XLSX.read(odpFile.buffer, { type: 'buffer' });
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    }
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Data kosong atau tidak dapat dibaca.' });
    }

    const keys = Object.keys(rows[0]).map(k => k.toLowerCase().trim());
    const findKey = (candidates: string[]) => {
      for (const c of candidates) {
        const idx = keys.indexOf(c);
        if (idx !== -1) return Object.keys(rows[0])[idx];
      }
      return null;
    };

    const kOdpName = findKey(['odp name', 'odp', 'odp_name', 'nama odp', 'cable sheath end locn', 'nama titik', 'titik', 'name', 'nama']);
    const kLat = findKey(['latitude', 'lat', 'y', 'lintang']);
    const kLon = findKey(['longitude', 'lon', 'long', 'x', 'bujur']);
    const kGeom = findKey(['geometry', 'geom', 'cable sheath elocn geom', 'wkt', 'koordinat']);
    const kStartLocnCol = findKey(['cable sheath start locn', 'start locn', 'odc locn', 'odc', 'nama odc']);
    const kLineGeom = findKey(['cable sheath geometry', 'route geometry', 'line geometry', 'jalur', 'linestring']);
    const kFolder = findKey(['nama lop auto', 'lop', 'folder', 'nama lop', 'route section', 'nama ruas', 'cluster', 'area']);
    const kCategory = findKey(['lop category', 'kategori', 'tipe', 'jenis', 'category']);
    const kCableSheathCode = findKey(['cable sheath', 'kode cable sheath', 'cable sheath code']);

    if (!kOdpName || !kFolder || (!(kLat && kLon) && !kGeom)) {
      return res.status(400).json({
        success: false,
        message: 'Gagal! Pastikan file ODP memiliki kolom:\n1. Nama (ODP/Locn)\n2. Folder (LOP/Route)\n3. Koordinat (Lat & Lon ATAU Geometry WKT).',
      });
    }

    const tierStats: Record<string, number> = { cable_sheath: 0, end_locn: 0, none: 0 };
    const chainStatusStats: Record<ChainStatus, number> = { REACHED_ODC: 0, PARTIAL: 0, NOT_FOUND: 0, CYCLE: 0, MAX_HOPS: 0, UNKNOWN_START: 0 };
    let totalHopsDrawn = 0;

    const records = rows.map((r, i) => {
      const rawCoords = extractPointCoords(kLat ? r[kLat] : null, kLon ? r[kLon] : null, kGeom ? r[kGeom] : null);
      const latF = rawCoords.lat;
      const lonF = rawCoords.lon;
      const startNameHint = kStartLocnCol ? String(r[kStartLocnCol] || '').trim() : '';
      const cableSheathVal = kCableSheathCode ? String(r[kCableSheathCode] || '').trim() : '';
      const odpNameVal = String(r[kOdpName] || '').trim();

      let hops: ChainHop[] = [];

      if (drawCable) {
        if (useReference && localRefLoaded) {
          const { hops: chainHops, status, entryTier } = buildChain(odpNameVal, latF, lonF, cableSheathVal);
          hops = chainHops;
          tierStats[entryTier] = (tierStats[entryTier] || 0) + 1;
          chainStatusStats[status] = (chainStatusStats[status] || 0) + 1;
          totalHopsDrawn += chainHops.length;
        }

        if (hops.length === 0) {
          const directLineRaw = extractLinePairs(kLineGeom ? r[kLineGeom] : null);
          if (directLineRaw && latF !== null && lonF !== null) {
            const oriented = orientLineByKnownEnd(directLineRaw, latF, lonF);
            const startLat = oriented && oriented[0] ? oriented[0][1] : null;
            const startLon = oriented && oriented[0] ? oriented[0][0] : null;
            let snapped = snapLineEndpoints(oriented, startLat, startLon, latF, lonF);
            snapped = sanitizeLine(snapped, startLat, startLon, latF, lonF);
            hops = [{ startName: startNameHint || 'Start Point', startLat, startLon, endName: odpNameVal, endLat: latF, endLon: lonF, linePairs: snapped, sheathCode: '' }];
          }
        }
      }

      const valid = latF !== null && lonF !== null && latF >= -90 && latF <= 90 && lonF >= -180 && lonF <= 180;
      let category = kCategory ? String(r[kCategory] || '').trim().toUpperCase() : '';
      if (!category || !LOP_CATEGORIES[category]) category = 'OPSIONAL';

      return {
        row: i + 2, name: odpNameVal, folder: String(r[kFolder] || '').trim(), category,
        lat: valid ? latF : null, lon: valid ? lonF : null, hops,
      };
    });

    const dateStr = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
    const safeDocName = safePath(docName);
    const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const groups: Record<string, typeof records> = {};
    let invalidCoords = 0;
    records.forEach(r => {
      const folderName = r.folder || '(Tanpa Nama LOP)';
      if (!groups[folderName]) groups[folderName] = [];
      groups[folderName].push(r);
      if (r.lat === null || r.lon === null) invalidCoords++;
    });

    // =====================================================================
    // 4. GENERATE KML -- titik ODC, titik ODP/closure lain, dan garis kabel
    //    dikumpulkan terpisah supaya bisa ditaruh di file/folder berbeda.
    // =====================================================================
    const buildSections = (items: typeof records) => {
      const drawnPoints = new Set<string>();
      const drawnSegments = new Set<string>();
      const odcXml: string[] = [];
      const odpXml: string[] = [];
      const cableXml: string[] = [];

      const drawPoint = (name: string, lat: number | null, lon: number | null) => {
        if (lat === null || lon === null || !name) return;
        const k = keyOf(name);
        if (drawnPoints.has(k)) return;
        drawnPoints.add(k);
        const isOdc = isOdcName(name);
        const xml = `        <Placemark>\n          <name>${escapeXml(name)}</name>\n          <styleUrl>${isOdc ? '#odcIconStyle' : '#iconStyle'}</styleUrl>\n          <Point><coordinates>${lon},${lat},0</coordinates></Point>\n        </Placemark>\n`;
        (isOdc ? odcXml : odpXml).push(xml);
      };

      items.forEach(r => {
        if (r.hops.length > 0) {
          r.hops.forEach(hop => {
            drawPoint(hop.startName, hop.startLat, hop.startLon);
            drawPoint(hop.endName, hop.endLat, hop.endLon);

            const segKey = `${keyOf(hop.startName)}||${keyOf(hop.endName)}`;
            if (!drawnSegments.has(segKey)) {
              let coordStr: string | null = null;
              if (hop.linePairs && hop.linePairs.length >= 2) coordStr = pairsToKmlCoordString(hop.linePairs);
              else if (hop.startLat !== null && hop.startLon !== null && hop.endLat !== null && hop.endLon !== null) coordStr = `${hop.startLon},${hop.startLat},0 ${hop.endLon},${hop.endLat},0`;
              if (coordStr) {
                const cableLabel = hop.sheathCode || `${hop.startName || 'Start'} ke ${hop.endName} - Jalur`;
                cableXml.push(`        <Placemark>\n          <name>${escapeXml(cableLabel)}</name>\n          <styleUrl>#cableStyle</styleUrl>\n          <LineString>\n            <tessellate>1</tessellate>\n            <coordinates>${coordStr}</coordinates>\n          </LineString>\n        </Placemark>\n`);
                drawnSegments.add(segKey);
              }
            }
          });
        } else if (r.lat !== null && r.lon !== null) {
          drawPoint(r.name, r.lat, r.lon);
        }
      });

      return { odcXml, odpXml, cableXml };
    };

    const wrapStandaloneKml = (title: string, styleBlock: string, placemarksXml: string[]) =>
      `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${escapeXml(title)}</name>\n${styleBlock}    <Folder>\n      <name>${escapeXml(title)}</name>\n${placemarksXml.join('')}    </Folder>\n  </Document>\n</kml>`;

    const renderKmlFolder = (folderName: string, items: typeof records) => {
      const { odcXml, odpXml, cableXml } = buildSections(items);
      return `    <Folder>\n      <name>${escapeXml(folderName)}</name>\n` +
        `      <Folder>\n        <name>ODC</name>\n${odcXml.join('')}      </Folder>\n` +
        `      <Folder>\n        <name>ODP</name>\n${odpXml.join('')}      </Folder>\n` +
        `      <Folder>\n        <name>CABLE SHEATH</name>\n${cableXml.join('')}      </Folder>\n` +
        `    </Folder>\n`;
    };

    if (mode === 'kml') {
      let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${escapeXml(docName)}</name>\n`;
      kml += iconStyleBlock + odcStyleBlock + cableStyleBlock;
      for (const [folder, items] of Object.entries(groups)) kml += renderKmlFolder(folder, items);
      kml += `  </Document>\n</kml>`;

      res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${safeDocName}_${dateStr}.kml"`);
      return res.send(kml);
    }

    const boqFilesByCategory: Record<string, Express.Multer.File> = {};
    for (const categoryKey of Object.keys(LOP_CATEGORIES)) {
      const field = boqFieldName(categoryKey);
      if (files[field] && files[field].length > 0) boqFilesByCategory[categoryKey] = files[field][0];
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeDocName}_${dateStr}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.pipe(res);

    const usedFolders: Record<string, boolean> = {};
    const categoryStats: Record<string, number> = {};

    for (const [origFolder, items] of Object.entries(groups)) {
      const folderCategory = items[0].category;
      categoryStats[folderCategory] = (categoryStats[folderCategory] || 0) + 1;

      const baseFolder = safePath(origFolder);
      let folderName = baseFolder;
      let key = folderName.toLowerCase();
      let idx = 1;
      while (usedFolders[key]) {
        idx++;
        folderName = `${baseFolder} (${idx})`;
        key = folderName.toLowerCase();
      }
      usedFolders[key] = true;

      const { odcXml, odpXml, cableXml } = buildSections(items);
      archive.append(wrapStandaloneKml(`${origFolder} - ODC`, odcStyleBlock, odcXml), { name: `${folderName}/ODC.kml` });
      archive.append(wrapStandaloneKml(`${origFolder} - ODP`, iconStyleBlock, odpXml), { name: `${folderName}/ODP.kml` });
      archive.append(wrapStandaloneKml(`${origFolder} - CABLE SHEATH`, cableStyleBlock, cableXml), { name: `${folderName}/CABLE SHEATH.kml` });

      const boqFile = boqFilesByCategory[folderCategory];
      if (boqFile) {
        const boqExt = boqFile.originalname.split('.').pop() || 'xlsx';
        archive.append(boqFile.buffer, { name: `${folderName}/BOQ ${folderName}.${boqExt}` });
      }
    }

    const categorySummary = Object.entries(categoryStats)
      .map(([cat, count]) => `- ${LOP_CATEGORIES[cat]?.name || cat}: ${count} LOP`)
      .join('\n');

    const refSummary = useReference
      ? (localRefLoaded
          ? `\nPencocokan Titik Awal Rantai:\n` +
            `- Cocok via Kode Cable Sheath: ${tierStats.cable_sheath}\n` +
            `- Cocok via Nama ODP (End Locn): ${tierStats.end_locn}\n` +
            `- Tidak ditemukan di referensi: ${tierStats.none}\n` +
            `\nHasil Penelusuran Rantai ODC -> ODP (per segmen):\n` +
            `- Berhasil sampai ke ODC: ${chainStatusStats.REACHED_ODC}\n` +
            `- Sebagian (data referensi habis sebelum sampai ODC): ${chainStatusStats.PARTIAL}\n` +
            `- Berhenti krn titik awal tidak diketahui (unset/"-"): ${chainStatusStats.UNKNOWN_START}\n` +
            `- Tidak ditemukan di referensi: ${chainStatusStats.NOT_FOUND}\n` +
            `- Siklus terdeteksi: ${chainStatusStats.CYCLE}\n` +
            `- Melebihi batas hop pengaman (${MAX_CHAIN_HOPS}): ${chainStatusStats.MAX_HOPS}\n` +
            `- Total segmen kabel digambar: ${totalHopsDrawn}\n` +
            (ambiguousEndLocnCount > 0 ? `- Titik "End Locn" dengan >1 kandidat segmen: ${ambiguousEndLocnCount}\n` : '')
          : `\nFile Referensi tidak diunggah atau kosong.\n`)
      : `\nPencocokan referensi dinonaktifkan (useReference=false)\n`;

    archive.append(
      `Total Titik: ${records.length}\nTotal LOP: ${Object.keys(groups).length}\nKoordinat tidak valid: ${invalidCoords}\nIkon: ${iconUrl}\n\nRingkasan Kategori LOP:\n${categorySummary}\n${refSummary}`,
      { name: 'LOG.txt' },
    );

    await archive.finalize();
  } catch (error: any) {
    console.error('Error Create LOP:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan internal server.' });
    }
  }
});

   // === 7. ENDPOINT LINE TO POINT ===
  app.post('/api/line-to-point', uploadMemory.single('kmlFile'), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'File KML/KMZ wajib diunggah!' });
      }

      const distanceMeters = Math.max(1, parseFloat(req.body.distance || '100'));
      const placemarkNamePattern = req.body.placemarkName || 'Titik {n}';
      const iconUrl = AVAILABLE_ICONS[req.body.placemarkIcon] || AVAILABLE_ICONS['Yellow Circle'];

      let kmlContent = '';
      const originalName = req.file.originalname.toLowerCase();

      if (originalName.endsWith('.kmz')) {
        const zip = new AdmZip(req.file.buffer);
        const zipEntries = zip.getEntries();
        const kmlEntry = zipEntries.find((entry: any) => entry.entryName.toLowerCase().endsWith('.kml'));
        if (!kmlEntry) {
          return res.status(400).json({ success: false, message: 'Tidak ada file KML di dalam arsip KMZ.' });
        }
        kmlContent = kmlEntry.getData().toString('utf8');
      } else if (originalName.endsWith('.kml')) {
        kmlContent = req.file.buffer.toString('utf8');
      } else {
        return res.status(400).json({ success: false, message: 'Hanya format .kml dan .kmz yang didukung.' });
      }

      const parser = new KMLDOMParser();
      const xmlDoc = parser.parseFromString(kmlContent, 'text/xml');
      
      const parseError = xmlDoc.getElementsByTagName("parsererror");
      if (parseError.length > 0) {
         return res.status(400).json({ success: false, message: 'Gagal membaca struktur KML. File rusak atau format tidak valid.' });
      }

      const lineStrings = xmlDoc.getElementsByTagName("LineString");
      const newPlacemarks: { name: string, lat: number, lon: number, icon: string }[] = [];
      let counter = 1;

      for (let i = 0; i < lineStrings.length; i++) {
        const coordsNode = lineStrings[i].getElementsByTagName("coordinates")[0];
        if (!coordsNode || !coordsNode.textContent) continue;
        
        const rawCoords = coordsNode.textContent.trim().split(/\s+/);
        const lineCoords: [number, number][] = [];
        
        for (const pt of rawCoords) {
          const parts = pt.split(',');
          if (parts.length >= 2) {
            const lon = parseFloatVal(parts[0]);
            const lat = parseFloatVal(parts[1]);
            if (lon !== null && lat !== null) {
              lineCoords.push([lon, lat]);
            }
          }
        }

        if (lineCoords.length < 2) continue;

        const line = turf.lineString(lineCoords);
        const totalLengthKm = turf.length(line, { units: 'kilometers' });
        const distanceKm = distanceMeters / 1000;
        
        const numPoints = Math.floor(totalLengthKm / distanceKm);
        
        for (let j = 0; j <= numPoints; j++) {
          const travelDist = j * distanceKm;
          const point = turf.along(line, travelDist, { units: 'kilometers' });
          
          newPlacemarks.push({
            name: placemarkNamePattern.replace('{n}', String(counter++)),
            lon: point.geometry.coordinates[0],
            lat: point.geometry.coordinates[1],
            icon: iconUrl
          });
        }
      }

      let documentNode = xmlDoc.getElementsByTagName("Document")[0];
      if (!documentNode) {
        documentNode = xmlDoc.getElementsByTagName("kml")[0] || xmlDoc;
      }

      const newFolder = xmlDoc.createElement("Folder");
      const folderName = xmlDoc.createElement("name");
      folderName.textContent = `Path Placemarks - ${distanceMeters}m interval`;
      newFolder.appendChild(folderName);

      for (const pm of newPlacemarks) {
        const placemarkNode = xmlDoc.createElement("Placemark");
        
        const nameNode = xmlDoc.createElement("name");
        nameNode.textContent = pm.name;
        placemarkNode.appendChild(nameNode);
        
        const styleNode = xmlDoc.createElement("Style");
        const iconStyleNode = xmlDoc.createElement("IconStyle");
        const iconNode = xmlDoc.createElement("Icon");
        const hrefNode = xmlDoc.createElement("href");
        hrefNode.textContent = pm.icon;
        
        iconNode.appendChild(hrefNode);
        iconStyleNode.appendChild(iconNode);
        styleNode.appendChild(iconStyleNode);
        placemarkNode.appendChild(styleNode);
        
        const pointNode = xmlDoc.createElement("Point");
        const coordsNode = xmlDoc.createElement("coordinates");
        coordsNode.textContent = `${pm.lon},${pm.lat},0`;
        pointNode.appendChild(coordsNode);
        placemarkNode.appendChild(pointNode);
        
        newFolder.appendChild(placemarkNode);
      }

      documentNode.appendChild(newFolder);

      const serializer = new KMLXMLSerializer();
      const finalKmlString = serializer.serializeToString(xmlDoc);

      const dateStr = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
      const baseName = originalName.replace(/\.(kml|kmz)$/i, '');
      const outputFilename = `${baseName}_export(${dateStr}).kml`;

      res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
      return res.send(finalKmlString);
      
    } catch (error: any) {
      console.error('Error Line to Point:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan pada server.' });
      }
    }
  });


  // === 8. ENDPOINT RENAME PLACEMARKS ===
  app.post('/api/rename-placemarks', uploadMemory.single('kmlFile'), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Invalid request. Please upload a KML/KMZ file.' });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== '.kml' && ext !== '.kmz') {
        return res.status(400).json({ success: false, message: 'Only KML and KMZ files are allowed.' });
      }

      let kmlString = '';

      if (ext === '.kmz') {
        const zip = new AdmZip(req.file.buffer);
        const zipEntries = zip.getEntries();
        
        const kmlEntry = zipEntries.find((entry: any) => entry.entryName.toLowerCase().endsWith('.kml'));
        if (!kmlEntry) {
          return res.status(400).json({ success: false, message: 'No KML file found in KMZ archive' });
        }
        kmlString = kmlEntry.getData().toString('utf8');
      } else {
        kmlString = req.file.buffer.toString('utf8');
      }

      const parser = new KMLDOMParser();
      const doc = parser.parseFromString(kmlString, 'text/xml');

      const parseError = doc.getElementsByTagName("parsererror");
      if (parseError.length > 0) {
         return res.status(400).json({ success: false, message: 'Gagal membaca struktur KML. File rusak atau format tidak valid.' });
      }

      const options: RenameOptions = {
        labelType: (req.body.labelType as 'numeric' | 'custom') || 'numeric',
        prefix: req.body.numericPrefix !== undefined ? String(req.body.numericPrefix) : 'Lokasi',
        startNumber: !isNaN(parseInt(req.body.startNumber)) ? Math.max(1, parseInt(req.body.startNumber)) : 1,
        numbering: (req.body.numbering as 'sequential' | 'random') || 'sequential',
        customName: req.body.customName !== undefined ? String(req.body.customName) : 'Lokasi{n}',
      };

      const updatedDoc = renamePlacemarks(doc, options);

      const serializer = new KMLXMLSerializer();
      let outputXml = serializer.serializeToString(updatedDoc);

      if (!outputXml.trim().startsWith('<?xml')) {
         outputXml = '<?xml version="1.0" encoding="UTF-8"?>\n' + outputXml;
      }

      const baseName = path.parse(req.file.originalname).name;
      const dateStr = new Date().toLocaleDateString('id-ID').replace(/\//g, '-'); 
      const outputName = sanitizeFileNameCustom(`${baseName}-export-(${dateStr}).kml`);

      res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
      res.setHeader('Cache-Control', 'must-revalidate');
      res.setHeader('Pragma', 'public');

      res.send(outputXml);

    } catch (error: any) {
      console.error('Error Rename Placemarks:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan sistem' });
      }
    }
  });


  // === 9. ENDPOINT POLYGON CENTROID ===
  app.post('/api/polygon-centroid', uploadMemory.single('kmlFile'), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Invalid request. Please upload a KML/KMZ file.' });
      }

      const file = req.file;
      const originalName = file.originalname;
      const fileExt = path.extname(originalName).toLowerCase();
      
      if (fileExt !== '.kml' && fileExt !== '.kmz') {
        return res.status(400).json({ success: false, message: 'Only KML and KMZ files are allowed.' });
      }

      let kmlContent = '';

      if (fileExt === '.kmz') {
        const zip = new AdmZip(file.buffer);
        const zipEntries = zip.getEntries();
        const kmlEntry = zipEntries.find((entry: any) => entry.entryName.toLowerCase().endsWith('.kml'));
        
        if (!kmlEntry) {
          return res.status(400).json({ success: false, message: 'No KML file found in KMZ archive' });
        }
        kmlContent = kmlEntry.getData().toString('utf8');
      } else {
        kmlContent = file.buffer.toString('utf8');
      }

      const parser = new KMLDOMParser();
      const xmlDoc = parser.parseFromString(kmlContent, 'text/xml');
      
      const parseError = xmlDoc.getElementsByTagName("parsererror");
      if (parseError.length > 0) {
        return res.status(400).json({ success: false, message: 'Failed to parse KML: Invalid XML structure.' });
      }

      const placemarkNamePattern = req.body.placemarkName || 'Rumah {n}';
      const placemarkIcon = req.body.placemarkIcon || 'Yellow Circle';
      
      const iconUrl = AVAILABLE_ICONS[placemarkIcon] || AVAILABLE_ICONS['Home'];

      const placemarksToAdd: { name: string, lat: number, lon: number, icon: string }[] = [];
      let counter = 1;

      const polygons = xmlDoc.getElementsByTagName('Polygon');
      
      for (let i = 0; i < polygons.length; i++) {
        const polygonNode = polygons[i];
        const coordElements = polygonNode.getElementsByTagName('coordinates');
        
        if (coordElements.length === 0) continue;
        
        const coordinatesText = coordElements[0].textContent;
        if (!coordinatesText) continue;

        const centroid = calculateCentroid(coordinatesText);
        if (centroid) {
          placemarksToAdd.push({
            name: placemarkNamePattern.replace('{n}', String(counter++)),
            lat: centroid.lat,
            lon: centroid.lon,
            icon: iconUrl
          });
        }
      }

      let documentNode = xmlDoc.getElementsByTagName("Document")[0];
      if (!documentNode) {
        documentNode = xmlDoc.getElementsByTagName("kml")[0] || xmlDoc;
      }

      const folderNode = xmlDoc.createElement('Folder');
      const folderNameNode = xmlDoc.createElement('name');
      folderNameNode.textContent = 'Centroid Placemarks';
      folderNode.appendChild(folderNameNode);

      for (const pm of placemarksToAdd) {
        const placemarkNode = xmlDoc.createElement('Placemark');
        
        const nameNode = xmlDoc.createElement('name');
        nameNode.textContent = pm.name;
        
        const styleNode = xmlDoc.createElement('Style');
        const iconStyleNode = xmlDoc.createElement('IconStyle');
        const iconNode = xmlDoc.createElement('Icon');
        const hrefNode = xmlDoc.createElement('href');
        hrefNode.textContent = pm.icon;
        
        iconNode.appendChild(hrefNode);
        iconStyleNode.appendChild(iconNode);
        styleNode.appendChild(iconStyleNode);
        
        const pointNode = xmlDoc.createElement('Point');
        const pointCoordsNode = xmlDoc.createElement('coordinates');
        pointCoordsNode.textContent = `${pm.lon},${pm.lat},0`;
        pointNode.appendChild(pointCoordsNode);

        placemarkNode.appendChild(nameNode);
        placemarkNode.appendChild(styleNode);
        placemarkNode.appendChild(pointNode);
        
        folderNode.appendChild(placemarkNode);
      }

      documentNode.appendChild(folderNode);

      const serializer = new KMLXMLSerializer();
      let outputXml = serializer.serializeToString(xmlDoc);

      if (!outputXml.trim().startsWith('<?xml')) {
        outputXml = '<?xml version="1.0" encoding="UTF-8"?>\n' + outputXml;
      }

      const dateStr = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
      const baseName = path.parse(originalName).name;
      const outputFilename = sanitizeFileNameCustom(`${baseName}-centroid-(${dateStr}).kml`);

      res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
      res.setHeader('Cache-Control', 'must-revalidate');
      res.setHeader('Pragma', 'public');
      
      res.send(outputXml);

    } catch (error: any) {
      console.error('Error in Centroid Generator:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan pada sistem.' });
      }
    }
  });

// === ENDPOINT WKT TO KML ===
// Riwayat perbaikan (ringkas):
// 1. Pin polygon pakai centroid berbobot-area (shoelace), bukan rata-rata vertex mentah.
// 2. Polygon & pin dipisah jadi 2 Placemark (bukan MultiGeometry campuran) -- viewer tertentu merusak shape kalau digabung.
// 3. Parsing ring/hole/multipolygon pakai split kurung yang sadar kedalaman, bukan regex.
// 4. Deteksi lat/lon tertukar diterapkan konsisten per-titik.
// 5. Centroid area tidak selalu di dalam polygon cekung -> diverifikasi point-in-polygon, fallback ke polylabel (pole of inaccessibility).
// 6. Dukungan kolom "Center Polygon" (WKT POINT manual) sbg pin, prioritas di atas hasil hitung otomatis.
// 7. Alias kolom WKT ditambah 'polygon'/'boundary'/'batas'/'bidang' dst agar header "Polygon" polos ikut kedeteksi.
// 8. Counter diagnostik `duplicateWktRows` -- baris dgn WKT identik persis (indikasi CSV salah kepotong kolom).
// 9. Delimiter-rescue: coba beberapa delimiter (,;|tab), pilih yg WKT-nya paling utuh. WKT yg tetap kepotong (kurung tak seimbang) di-skip & dicatat sbg `malformedWktRows`.
// 10. Verifikasi self-intersection per ring: kalau hasil vote arah lat/lon menyilang diri sendiri tapi kebalikannya valid, auto-correct (`geometryAutoCorrectedRows`). Kalau dua-duanya menyilang, tetap dipakai apa adanya tapi dicatat (`selfIntersectingRows`).
// 11. Counter `suspiciouslyLargeRows` -- bounding box > 0.5 derajat, indikasi vertex "melompat"/tercampur baris lain.
// 12. Dukungan input file Excel (.xlsx/.xls) selain CSV -- deteksi otomatis dari nama file/mimetype, parse via SheetJS, delimiter-rescue CSV dilewati krn tidak relevan.
// 13. Kalau 0 baris menghasilkan geometry valid, kembalikan 400 + diagnostics (kolom yg terdeteksi, counter skip/malformed) alih-alih kirim KML kosong tanpa penjelasan. Header respons & komentar penutup dipindah ke setelah loop selesai.
// 14. FALLBACK KE CENTER POLYGON: kalau kolom WKT yg dipilih (mis. "Kelurahan"/"Kecamatan"/"Kota"/"Provinsi")
//     gagal diparse atau kosong, baris TIDAK langsung di-skip lagi. Kalau kolom "Center Polygon" (atau
//     Center Lat/Lon) tersedia & valid, titik itu dipakai sbg geometry utama (Point), bukan cuma sbg pin
//     seperti sebelumnya. Ini mengatasi kasus umum di file .xlsx: WKT polygon administrasi dgn vertex
//     sangat banyak (level kota/provinsi) terpotong krn batas 32.767 karakter per sel Excel, sehingga
//     kurungnya jadi tak seimbang dan gagal parse -- ditandai jg via counter baru
//     `possiblyTruncatedByExcelCellLimit`. Kalau WKT-nya justru berhasil diparse, Center Polygon tetap
//     dipakai sbg titik pin persis seperti perilaku lama (tidak menggantikan polygon yg valid).

function normalizeHeaderName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]/g, "");
}

function findColumnByAliases(headers: string[], aliases: string[]): string | null {
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    normalized: normalizeHeaderName(h),
  }));

  for (const alias of aliases) {
    const target = normalizeHeaderName(alias);
    const exact = normalizedHeaders.find((h) => h.normalized === target);
    if (exact) return exact.original;
  }

  for (const alias of aliases) {
    const target = normalizeHeaderName(alias);
    const partial = normalizedHeaders.find((h) => h.normalized.includes(target));
    if (partial) return partial.original;
  }

  return null;
}

// Cek WKT well-formed scr struktural: prefix dikenal + kurung seimbang. Menangkap WKT yg kepotong akibat CSV salah parse.
function isWellFormedWkt(raw: string | undefined | null): boolean {
  const s = String(raw || "").trim();
  if (!s) return false;
  const upper = s.toUpperCase();
  const validPrefixes = ["POINT", "MULTIPOINT", "LINESTRING", "MULTILINESTRING", "POLYGON", "MULTIPOLYGON", "GEOMETRYCOLLECTION"];
  if (!validPrefixes.some((p) => upper.startsWith(p))) return false;
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
}

interface DelimiterAttempt {
  records: Record<string, string>[];
  headers: string[];
  wktColumn: string | null;
  malformedRate: number; // 0 = bersih, 1 = kolom WKT tak ketemu / semua rusak
}

// Parse CSV pakai satu kandidat delimiter, lalu skor "kerusakan"-nya dari sampel kolom WKT.
function tryParseCsvWithDelimiter(csvText: string, delimiter: string): DelimiterAttempt | null {
  try {
    const records: Record<string, string>[] = parseCsvSync(csvText, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
      delimiter,
      trim: true,
    });
    if (records.length === 0) return null;

    const headers = Object.keys(records[0]);
    const wktColumn = findColumnByAliases(headers, [
      "wkt", "geometry", "geom", "shape", "wkb",
      "polygon", "boundary", "batas", "bidang", "batas bidang", "batas polygon",
    ]);
    if (!wktColumn) return { records, headers, wktColumn: null, malformedRate: 1 };

    const sampleSize = Math.min(50, records.length);
    let malformed = 0, checked = 0;
    for (let i = 0; i < sampleSize; i++) {
      const v = String(records[i][wktColumn] || "").trim();
      if (!v) continue;
      checked++;
      if (!isWellFormedWkt(v)) malformed++;
    }
    return { records, headers, wktColumn, malformedRate: checked > 0 ? malformed / checked : 0 };
  } catch {
    return null;
  }
}

// Coba beberapa delimiter umum, ambil yg malformedRate-nya paling rendah (pengaman kalau detectCsvDelimiter salah tebak).
function pickBestCsvDelimiter(
  csvText: string,
  initialDelimiter: string
): { delimiter: string; attempt: DelimiterAttempt; autoCorrected: boolean } | null {
  const candidates = Array.from(new Set([initialDelimiter, ",", ";", "\t", "|"].filter((d): d is string => !!d)));

  let best: DelimiterAttempt | null = null;
  let bestDelimiter = initialDelimiter;

  for (const d of candidates) {
    const attempt = tryParseCsvWithDelimiter(csvText, d);
    if (!attempt) continue;
    if (!best || attempt.malformedRate < best.malformedRate) {
      best = attempt;
      bestDelimiter = d;
    }
    if (best.malformedRate === 0) break;
  }

  if (!best) return null;
  return { delimiter: bestDelimiter, attempt: best, autoCorrected: bestDelimiter !== initialDelimiter };
}

function isValidLatLon(latVal: number | null, lonVal: number | null): boolean {
  return (
    latVal !== null &&
    lonVal !== null &&
    latVal >= -90 &&
    latVal <= 90 &&
    lonVal >= -180 &&
    lonVal <= 180
  );
}

function buildPointGeometry(lon: number, lat: number, styleId: string = 'pointStyle'): string {
  return `\n<styleUrl>#${styleId}</styleUrl>\n<Point><coordinates>${lon},${lat},0</coordinates></Point>`;
}

// =====================================================================
// HELPERS WKT
// =====================================================================

function parseCoordPair(token: string): [number, number] | null {
  const parts = token.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const a = parseFloatVal(parts[0]);
  const b = parseFloatVal(parts[1]);
  if (a === null || b === null) return null;
  let lon = a, lat = b;
  if (Math.abs(b) > 90 && Math.abs(a) <= 90) { lon = b; lat = a; } // tertukar di sumber data
  return [lon, lat];
}

function parseCoordList(str: string): [number, number][] {
  const inner = str.trim().replace(/^\(/, "").replace(/\)$/, "");
  return inner
    .split(",")
    .map(parseCoordPair)
    .filter((p): p is [number, number] => p !== null);
}

// Vote mayoritas satu ring penuh: tentukan apakah urutan lat/lon perlu ditukar. Vertex ambigu abstain.
function analyzeRingCoordOrder(rawPairs: [number, number][]): 'asis' | 'swap' {
  let votesSwap = 0, votesAsIs = 0;
  for (const [a, b] of rawPairs) {
    const aLooksLikeLat = Math.abs(a) <= 90;
    const bLooksLikeLat = Math.abs(b) <= 90;
    if (bLooksLikeLat && !aLooksLikeLat) votesAsIs++;
    else if (aLooksLikeLat && !bLooksLikeLat) votesSwap++;
  }
  return votesSwap > votesAsIs ? 'swap' : 'asis';
}

// =====================================================================
// SELF-INTERSECTION TEST (verifikasi geometris murni)
// =====================================================================
function ccw(A: [number, number], B: [number, number], C: [number, number]): number {
  return (C[1] - A[1]) * (B[0] - A[0]) - (B[1] - A[1]) * (C[0] - A[0]);
}

function onSegment(A: [number, number], B: [number, number], P: [number, number]): boolean {
  return (
    Math.min(A[0], B[0]) - 1e-12 <= P[0] && P[0] <= Math.max(A[0], B[0]) + 1e-12 &&
    Math.min(A[1], B[1]) - 1e-12 <= P[1] && P[1] <= Math.max(A[1], B[1]) + 1e-12
  );
}

// Tes perpotongan segmen [p1,p2] & [p3,p4], termasuk kasus collinear.
function segmentsIntersect(
  p1: [number, number], p2: [number, number],
  p3: [number, number], p4: [number, number]
): boolean {
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;

  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;

  return false;
}

// Ring > ini dilewati (skip cek) demi performa -- O(n^2).
const SELF_INTERSECT_CHECK_MAX_VERTICES = 1500;

// Cek apakah ring menyilang dirinya sendiri (dua sisi tak bertetangga berpotongan).
function ringSelfIntersects(ring: [number, number][]): boolean {
  const n = ring.length;
  if (n < 4) return false;

  const closed = ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1];
  const pts = closed ? ring.slice(0, n - 1) : ring;
  const m = pts.length;
  if (m < 4 || m > SELF_INTERSECT_CHECK_MAX_VERTICES) return false;

  for (let i = 0; i < m; i++) {
    const a1 = pts[i], a2 = pts[(i + 1) % m];
    for (let j = i + 1; j < m; j++) {
      const adjacent = j === (i + 1) % m || i === (j + 1) % m;
      if (adjacent) continue;
      const b1 = pts[j], b2 = pts[(j + 1) % m];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

interface RingParseResult {
  coords: [number, number][];
  selfIntersecting: boolean;  // kedua interpretasi tetap menyilang diri sendiri
  geometryCorrected: boolean; // vote awal salah, dikoreksi ke interpretasi sebaliknya
}

// Parse ring dgn SATU keputusan tukar/tidak-tukar utk seluruh vertex (bukan per-titik), lalu diverifikasi via self-intersection test.
function parseRingCoordsConsistent(str: string): RingParseResult {
  const inner = str.trim().replace(/^\(/, "").replace(/\)$/, "");
  const tokens = inner.split(",");

  const rawPairs: [number, number][] = [];
  for (const t of tokens) {
    const parts = t.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const a = parseFloatVal(parts[0]);
    const b = parseFloatVal(parts[1]);
    if (a === null || b === null) continue;
    rawPairs.push([a, b]);
  }
  if (rawPairs.length === 0) return { coords: [], selfIntersecting: false, geometryCorrected: false };

  const order = analyzeRingCoordOrder(rawPairs);
  const voteResult: [number, number][] = rawPairs.map(([a, b]) => (order === 'swap' ? [b, a] : [a, b]));

  if (!ringSelfIntersects(voteResult)) {
    return { coords: voteResult, selfIntersecting: false, geometryCorrected: false };
  }

  const otherResult: [number, number][] = rawPairs.map(([a, b]) => (order === 'swap' ? [a, b] : [b, a]));
  if (!ringSelfIntersects(otherResult)) {
    return { coords: otherResult, selfIntersecting: false, geometryCorrected: true };
  }

  return { coords: voteResult, selfIntersecting: true, geometryCorrected: false };
}

// Rentang geografis Indonesia -- dipakai menuntun rekonstruksi kolom center yg titik desimalnya hilang/korup.
const INDONESIA_LAT_RANGE: [number, number] = [-11, 6];
const INDONESIA_LON_RANGE: [number, number] = [95, 141];

function digitsOnly(raw: string | undefined): { sign: 1 | -1; digits: string } | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const sign: 1 | -1 = str.startsWith('-') ? -1 : 1;
  const digits = str.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return { sign, digits };
}

// Bangun kandidat angka dgn titik desimal disisipkan setelah `intLen` digit pertama.
function buildCandidate(sign: 1 | -1, digits: string, intLen: number): number | null {
  if (intLen < 1 || intLen > digits.length) return null;
  const intPart = digits.slice(0, intLen);
  const fracPart = digits.slice(intLen);
  const numStr = intPart + (fracPart.length ? '.' + fracPart : '');
  const n = parseFloat(numStr);
  return isNaN(n) ? null : sign * n;
}

// Rekonstruksi koordinat yg titik desimalnya hilang: lucuti jadi digit murni, coba tiap posisi titik desimal, pilih kandidat pertama yg jatuh di rentang Indonesia (fallback ke rentang umum -90..90/-180..180). Aman jg dipakai utk data yg sudah bersih.
function reconstructCorruptedCoord(raw: string | undefined, kind: 'lat' | 'lon'): number | null {
  const parsed = digitsOnly(raw);
  if (!parsed) return null;
  const { sign, digits } = parsed;
  const maxIntLen = Math.min(digits.length, 4);

  const preferred = kind === 'lat' ? INDONESIA_LAT_RANGE : INDONESIA_LON_RANGE;
  const general: [number, number] = kind === 'lat' ? [-90, 90] : [-180, 180];

  let fallback: number | null = null;
  for (let intLen = 1; intLen <= maxIntLen; intLen++) {
    const val = buildCandidate(sign, digits, intLen);
    if (val === null) continue;
    if (val >= preferred[0] && val <= preferred[1]) return val;
    if (fallback === null && val >= general[0] && val <= general[1]) fallback = val;
  }
  return fallback;
}

// Ambil [lon, lat] dari "POINT(lon lat)" (atau "lon lat" polos) -- khusus kolom center gabungan.
function extractWktPoint(raw: string): [number, number] | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const upper = str.toUpperCase();
  let content = str;
  if (upper.startsWith("POINT")) {
    const openIdx = str.indexOf("(");
    const closeIdx = str.lastIndexOf(")");
    if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) return null;
    content = str.slice(openIdx + 1, closeIdx);
  }
  return parseCoordPair(content);
}

// Resolusi pasangan center dari 2 kolom angka terpisah (Center Lat/Lon), pakai reconstructCorruptedCoord + swap-detection sbg jaring pengaman.
function resolveCenterLatLon(
  latRaw: string | undefined,
  lonRaw: string | undefined
): [number, number] | null {
  let latVal = reconstructCorruptedCoord(latRaw, 'lat');
  let lonVal = reconstructCorruptedCoord(lonRaw, 'lon');
  if (latVal === null || lonVal === null) return null;

  if (Math.abs(latVal) > 90 && Math.abs(lonVal) <= 90) {
    const temp = latVal;
    latVal = lonVal;
    lonVal = temp;
  }

  if (!isValidLatLon(latVal, lonVal)) return null;
  return [lonVal, latVal];
}

// Split per koma hanya di kedalaman kurung 0 -- utk pisah ring/polygon.
function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") { depth++; current += ch; }
    else if (ch === ")") { depth--; current += ch; }
    else if (ch === "," && depth === 0) { parts.push(current); current = ""; }
    else { current += ch; }
  }
  if (current.trim()) parts.push(current);
  return parts.map((s) => s.trim());
}

function coordsToKml(coords: [number, number][]): string {
  return coords.map(([lon, lat]) => `${lon},${lat},0`).join(" ");
}

function ringArea(ring: [number, number][]): number {
  let areaSum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    areaSum += x0 * y1 - x1 * y0;
  }
  return Math.abs(areaSum / 2);
}

// Centroid area (shoelace) -- hanya dijamin di dalam ring utk polygon convex; utk cekung cuma fast-path (lihat computeLabelPoint).
function computePolygonCentroid(ring: [number, number][]): [number, number] {
  const n = ring.length;
  let areaSum = 0, cxSum = 0, cySum = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    areaSum += cross;
    cxSum += (x0 + x1) * cross;
    cySum += (y0 + y1) * cross;
  }
  const area = areaSum / 2;
  if (Math.abs(area) < 1e-12) {
    const avgX = ring.reduce((s, p) => s + p[0], 0) / n;
    const avgY = ring.reduce((s, p) => s + p[1], 0) / n;
    return [avgX, avgY];
  }
  return [cxSum / (6 * area), cySum / (6 * area)];
}

function buildPolygonKml(rings: [number, number][][]): string {
  const [outer, ...holes] = rings;
  let kml = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsToKml(outer)}</coordinates></LinearRing></outerBoundaryIs>`;
  for (const hole of holes) {
    kml += `<innerBoundaryIs><LinearRing><coordinates>${coordsToKml(hole)}</coordinates></LinearRing></innerBoundaryIs>`;
  }
  kml += `</Polygon>`;
  return kml;
}

// =====================================================================
// TITIK LABEL POLYGON -- fast-path centroid + fallback polylabel (pole of inaccessibility)
// =====================================================================

type Ring = [number, number][];

// Jarak (x,y) ke tepi terdekat, bertanda: + di dalam, - di luar. Ray-casting per ring (outer+hole).
function pointToPolygonDist(x: number, y: number, rings: Ring[]): number {
  let inside = false;
  let minDistSq = Infinity;

  for (const ring of rings) {
    const len = ring.length;
    for (let i = 0, j = len - 1; i < len; j = i++) {
      const a = ring[i];
      const b = ring[j];

      if ((a[1] > y) !== (b[1] > y) &&
          x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
        inside = !inside;
      }

      minDistSq = Math.min(minDistSq, segDistSq(x, y, a, b));
    }
  }

  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function segDistSq(px: number, py: number, a: [number, number], b: [number, number]): number {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }

  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

function ringBounds(ring: Ring): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// Batas bbox "wajar" per bidang (~55km). Generous scr sengaja.
const OVERSIZED_BBOX_DEGREES = 0.5;

interface PLCell {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
}

function makeCell(x: number, y: number, h: number, rings: Ring[]): PLCell {
  const d = pointToPolygonDist(x, y, rings);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

// Max-heap sederhana berdasar `max`, utk best-first search sel grid.
class PLQueue {
  private items: PLCell[] = [];

  push(cell: PLCell) {
    this.items.push(cell);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].max >= this.items[i].max) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): PLCell | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop() as PLCell;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      const n = this.items.length;
      while (true) {
        const l = i * 2 + 1, r = i * 2 + 2;
        let largest = i;
        if (l < n && this.items[l].max > this.items[largest].max) largest = l;
        if (r < n && this.items[r].max > this.items[largest].max) largest = r;
        if (largest === i) break;
        [this.items[largest], this.items[i]] = [this.items[i], this.items[largest]];
        i = largest;
      }
    }
    return top;
  }
}

// Cari titik di dalam polygon yg jaraknya ke tepi paling jauh (ref: Mapbox Polylabel). Dijamin di dalam ring, termasuk polygon cekung/berlubang.
function polylabel(rings: Ring[], precision: number, maxIter: number = 20000): [number, number] {
  const outer = rings[0];
  const { minX, minY, maxX, maxY } = ringBounds(outer);
  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);

  if (cellSize <= 0) return [(minX + maxX) / 2, (minY + maxY) / 2];

  const h = cellSize / 2;
  const queue = new PLQueue();

  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(makeCell(x + h, y + h, h, rings));
    }
  }

  let best = makeCell(minX + width / 2, minY + height / 2, 0, rings);
  const areaCentroid = computePolygonCentroid(outer);
  const centroidCell = makeCell(areaCentroid[0], areaCentroid[1], 0, rings);
  if (centroidCell.d > best.d) best = centroidCell;

  let cell: PLCell | undefined;
  let iter = 0;
  while ((cell = queue.pop()) && iter < maxIter) {
    iter++;
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;

    const half = cell.h / 2;
    queue.push(makeCell(cell.x - half, cell.y - half, half, rings));
    queue.push(makeCell(cell.x + half, cell.y - half, half, rings));
    queue.push(makeCell(cell.x - half, cell.y + half, half, rings));
    queue.push(makeCell(cell.x + half, cell.y + half, half, rings));
  }

  return [best.x, best.y];
}

// Titik label akhir: coba centroid area dulu (murah), fallback ke polylabel kalau di luar ring (polygon cekung).
function computeLabelPoint(rings: Ring[]): [number, number] {
  const outer = rings[0];
  const areaCentroid = computePolygonCentroid(outer);

  if (pointToPolygonDist(areaCentroid[0], areaCentroid[1], rings) > 0) {
    return areaCentroid;
  }

  const { minX, minY, maxX, maxY } = ringBounds(outer);
  const size = Math.max(maxX - minX, maxY - minY);
  const precision = Math.max(size * 0.01, 1e-7);
  return polylabel(rings, precision);
}

interface WktGeometryResult {
  geometry: string;
  labelPoint: [number, number] | null;
  hasSelfIntersectingRing?: boolean;
  wasGeometryCorrected?: boolean;
  hasOversizedBoundingBox?: boolean;
}

// Polygon & pin sengaja dipisah (bukan MultiGeometry campuran) -- lihat catatan #2 di atas.
function parseWktToKml(wktRaw: string): WktGeometryResult {
  const empty: WktGeometryResult = { geometry: "", labelPoint: null };
  try {
    const wkt = wktRaw.trim();
    const upper = wkt.toUpperCase();
    const openIdx = wkt.indexOf("(");
    if (openIdx === -1) return empty;
    const content = wkt.slice(openIdx);

    if (upper.startsWith("POINT")) {
      const p = parseCoordPair(content.slice(1, -1));
      if (!p) return empty;
      return { geometry: buildPointGeometry(p[0], p[1]), labelPoint: null };
    }

    if (upper.startsWith("MULTIPOINT")) {
      const groups = splitTopLevel(content.slice(1, -1));
      const pts = groups
        .map((g) => parseCoordPair(g.replace(/[()]/g, "")))
        .filter((p): p is [number, number] => p !== null);
      if (pts.length === 0) return empty;
      const geometry = `\n<styleUrl>#pointStyle</styleUrl>\n<MultiGeometry>${pts
        .map(([lon, lat]) => `<Point><coordinates>${lon},${lat},0</coordinates></Point>`)
        .join("")}</MultiGeometry>`;
      return { geometry, labelPoint: null };
    }

    if (upper.startsWith("MULTILINESTRING")) {
      const groups = splitTopLevel(content.slice(1, -1));
      const lines = groups.map((g) => parseCoordList(g)).filter((c) => c.length >= 2);
      if (lines.length === 0) return empty;
      const geometry = `\n<styleUrl>#lineStyle</styleUrl>\n<MultiGeometry>${lines
        .map((c) => `<LineString><tessellate>1</tessellate><coordinates>${coordsToKml(c)}</coordinates></LineString>`)
        .join("")}</MultiGeometry>`;
      return { geometry, labelPoint: null };
    }

    if (upper.startsWith("LINESTRING")) {
      const coords = parseCoordList(content.slice(1, -1));
      if (coords.length < 2) return empty;
      const geometry = `\n<styleUrl>#lineStyle</styleUrl>\n<LineString><tessellate>1</tessellate><coordinates>${coordsToKml(coords)}</coordinates></LineString>`;
      return { geometry, labelPoint: null };
    }

    if (upper.startsWith("MULTIPOLYGON")) {
      const polyGroups = splitTopLevel(content.slice(1, -1));
      const polys: [number, number][][][] = [];
      let anySelfIntersecting = false;
      let anyCorrected = false;
      for (const pg of polyGroups) {
        const pgInner = pg.trim().replace(/^\(/, "").replace(/\)$/, "");
        const ringResults = splitTopLevel(pgInner).map((rg) => parseRingCoordsConsistent(rg));
        const rings = ringResults.map((r) => r.coords).filter((r) => r.length >= 3);
        for (const r of ringResults) {
          if (r.selfIntersecting) anySelfIntersecting = true;
          if (r.geometryCorrected) anyCorrected = true;
        }
        if (rings.length > 0) polys.push(rings);
      }
      if (polys.length === 0) return empty;

      // Pin ditaruh di sub-polygon dgn luas terbesar.
      let biggestIdx = 0, biggestArea = -1;
      polys.forEach((rings, idx) => {
        const a = ringArea(rings[0]);
        if (a > biggestArea) { biggestArea = a; biggestIdx = idx; }
      });
      const centroid = computeLabelPoint(polys[biggestIdx]);
      const polygonsXml = polys.map((rings) => buildPolygonKml(rings)).join("");
      const geometry = `\n<styleUrl>#polygonStyle</styleUrl>\n<MultiGeometry>${polygonsXml}</MultiGeometry>`;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const rings of polys) {
        const b = ringBounds(rings[0]);
        minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
      }
      const oversized = (maxX - minX) > OVERSIZED_BBOX_DEGREES || (maxY - minY) > OVERSIZED_BBOX_DEGREES;

      return {
        geometry,
        labelPoint: centroid,
        hasSelfIntersectingRing: anySelfIntersecting,
        wasGeometryCorrected: anyCorrected,
        hasOversizedBoundingBox: oversized,
      };
    }

    if (upper.startsWith("POLYGON")) {
      const ringResults = splitTopLevel(content.slice(1, -1)).map((rg) => parseRingCoordsConsistent(rg));
      const rings = ringResults.map((r) => r.coords).filter((r) => r.length >= 3);
      if (rings.length === 0) return empty;

      const anySelfIntersecting = ringResults.some((r) => r.selfIntersecting);
      const anyCorrected = ringResults.some((r) => r.geometryCorrected);

      const centroid = computeLabelPoint(rings);
      const geometry = `\n<styleUrl>#polygonStyle</styleUrl>${buildPolygonKml(rings)}`;

      const b = ringBounds(rings[0]);
      const oversized = (b.maxX - b.minX) > OVERSIZED_BBOX_DEGREES || (b.maxY - b.minY) > OVERSIZED_BBOX_DEGREES;

      return {
        geometry,
        labelPoint: centroid,
        hasSelfIntersectingRing: anySelfIntersecting,
        wasGeometryCorrected: anyCorrected,
        hasOversizedBoundingBox: oversized,
      };
    }
  } catch (e) {
    return empty;
  }
  return empty;
}

// =====================================================================
// HELPERS EXCEL (.xlsx/.xls)
// =====================================================================
// Deteksi Excel dari ekstensi nama file atau mimetype.
function isExcelFile(filename: string, mimetype: string): boolean {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const excelMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
  ];
  return ext === "xlsx" || ext === "xls" || excelMimes.includes(mimetype);
}

function excelCellToString(value: any): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

// Cari baris header sebenarnya: baris pertama yg punya >=2 kolom terisi.
// Melewati baris judul/laporan yg sering ada di atas tabel data Excel.
function findExcelHeaderRowIndex(rows: any[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const nonEmptyCount = rows[i].filter((c) => excelCellToString(c) !== "").length;
    if (nonEmptyCount >= 2) return i;
  }
  return 0;
}

// Isi header yg kosong akibat merged cell horizontal di baris header,
// pakai nilai dari sel kiri-atas merge tsb.
function fillMergedHeaderCells(sheet: any, headerRowIndex: number, headers: string[]): string[] {
  const merges = (sheet['!merges'] || []) as any[];
  const filled = [...headers];
  for (const m of merges) {
    if (m.s.r !== headerRowIndex || m.e.r !== headerRowIndex) continue;
    const topLeft = filled[m.s.c];
    if (!topLeft) continue;
    for (let c = m.s.c; c <= m.e.c; c++) {
      if (!filled[c]) filled[c] = topLeft;
    }
  }
  return filled;
}

// Konversi sheet Excel jadi records string spt hasil CSV parse. Baris kosong dilewati.
// Baris header dideteksi otomatis (bukan selalu rows[0]) + merged header cell ditangani.
function parseExcelToRecords(
  buffer: Buffer,
  sheetName?: string
): { records: Record<string, string>[]; headers: string[] } {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const targetSheet = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
  const sheet = wb.Sheets[targetSheet];
  if (!sheet) return { records: [], headers: [] };

  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  if (rows.length === 0) return { records: [], headers: [] };

  const headerRowIndex = findExcelHeaderRowIndex(rows);
  let headers = rows[headerRowIndex].map((h) => excelCellToString(h));
  headers = fillMergedHeaderCells(sheet, headerRowIndex, headers);

  const records: Record<string, string>[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => excelCellToString(c) === "")) continue;
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      rec[h] = excelCellToString(row[idx]);
    });
    records.push(rec);
  }
  return { records, headers: headers.filter(Boolean) };
}

app.post(
  '/api/wkt-to-kml',
  uploadMemory.single('csv_file'),
  async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request. Please upload a CSV or Excel file.',
        });
      }

      const file = req.file;
      const geometryMode = req.body.geometry_mode === 'latlon' ? 'latlon' : 'wkt';
      const wktColumnReq = req.body.wkt_column;
      const latColumnReq = req.body.lat_column;
      const lonColumnReq = req.body.lon_column;
      const nameColumnReq = req.body.name_column;

      let descriptionColumns: string[] = [];
      try {
        descriptionColumns = req.body.description_columns
          ? JSON.parse(req.body.description_columns)
          : [];
      } catch {
        descriptionColumns = [];
      }

      // Excel vs CSV dari nama file/mimetype. Excel lewati delimiter-rescue (tak relevan, kolom sudah per-sel).
      const isExcel = isExcelFile(file.originalname || '', file.mimetype || '');

      let records: Record<string, string>[];
      let usedDelimiter = isExcel ? 'n/a (excel)' : ',';
      let delimiterAutoCorrected = false;
      let initialDelimiter = ''; // dipakai lagi di komentar penutup KML

      if (isExcel) {
        const parsedExcel = parseExcelToRecords(file.buffer, req.body.sheet_name);
        if (parsedExcel.records.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'File Excel kosong, sheet tidak ditemukan, atau format tidak valid.',
          });
        }
        records = parsedExcel.records;
      } else {
        const csvText = file.buffer.toString('utf8');
        initialDelimiter = detectCsvDelimiter(csvText);
        usedDelimiter = initialDelimiter;

        if (geometryMode === 'wkt') {
          const picked = pickBestCsvDelimiter(csvText, initialDelimiter);
          if (!picked || picked.attempt.records.length === 0) {
            return res.status(400).json({
              success: false,
              message: 'File CSV kosong atau format tidak valid.',
            });
          }
          records = picked.attempt.records;
          usedDelimiter = picked.delimiter;
          delimiterAutoCorrected = picked.autoCorrected;
        } else {
          records = parseCsvSync(csvText, {
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true,
            bom: true,
            delimiter: initialDelimiter,
            trim: true,
          });
          if (records.length === 0) {
            return res.status(400).json({
              success: false,
              message: 'File CSV kosong atau format tidak valid.',
            });
          }
        }
      }

      const headers = Object.keys(records[0]);

      const wktColumn =
        (wktColumnReq && headers.includes(wktColumnReq) ? wktColumnReq : null) ||
        findColumnByAliases(headers, [
          'wkt', 'geometry', 'geom', 'shape', 'wkb',
          'polygon', 'boundary', 'batas', 'bidang', 'batas bidang', 'batas polygon',
        ]);

      const latColumn =
        (latColumnReq && headers.includes(latColumnReq) ? latColumnReq : null) ||
        findColumnByAliases(headers, ['latitude', 'lat', 'lintang', 'y']);

      const lonColumn =
        (lonColumnReq && headers.includes(lonColumnReq) ? lonColumnReq : null) ||
        findColumnByAliases(headers, ['longitude', 'lon', 'lng', 'long', 'bujur', 'x']);

      const nameColumn =
        (nameColumnReq && headers.includes(nameColumnReq) ? nameColumnReq : null) ||
        findColumnByAliases(headers, ['name', 'nama', 'title', 'id', 'objectid', 'object_id', 'pointname']);

      // Prioritas 1: kolom WKT POINT gabungan (mis. "Center Polygon"), format "lon lat" tidak ambigu.
      const centerColumnReq = req.body.center_column;
      const centerColumn =
        (centerColumnReq && headers.includes(centerColumnReq) ? centerColumnReq : null) ||
        findColumnByAliases(headers, [
          'center polygon', 'center_polygon', 'centerpolygon',
          'polygon center', 'pusat polygon', 'titik pusat', 'pusat',
          'centroid', 'label point', 'labelpoint', 'pin point', 'pin',
        ]);

      // Fallback: 2 kolom angka terpisah Center Lat/Lon.
      const centerLonColumnReq = req.body.center_lon_column;
      const centerLatColumnReq = req.body.center_lat_column;

      const centerLonColumn =
        (centerLonColumnReq && headers.includes(centerLonColumnReq) ? centerLonColumnReq : null) ||
        findColumnByAliases(headers, [
          'center longitude', 'center_longitude', 'centerlongitude',
          'center lon', 'center_lon', 'centerlon',
          'centroid longitude', 'centroid_longitude', 'centroid lon', 'centroid_lon',
          'pusat bujur', 'bujur pusat', 'longitude pusat', 'longitude center',
          'label longitude', 'label_lon', 'pin longitude', 'pin_lon',
          'center_x', 'centerx',
        ]);

      const centerLatColumn =
        (centerLatColumnReq && headers.includes(centerLatColumnReq) ? centerLatColumnReq : null) ||
        findColumnByAliases(headers, [
          'center latitude', 'center_latitude', 'centerlatitude',
          'center lat', 'center_lat', 'centerlat',
          'centroid latitude', 'centroid_latitude', 'centroid lat', 'centroid_lat',
          'pusat lintang', 'lintang pusat', 'latitude pusat', 'latitude center',
          'label latitude', 'label_lat', 'pin latitude', 'pin_lat',
          'center_y', 'centery',
        ]);

      if (!nameColumn) {
        return res.status(400).json({
          success: false,
          message: 'Kolom nama tidak ditemukan. Tambahkan kolom Name/Nama/ID atau pilih manual.',
        });
      }

      const dateStr = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');

      const kmlParts: string[] = [];
      kmlParts.push(`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
    <name>Converted from CSV</name>
    <description>Data converted from CSV to KML on ${dateStr}</description>
    <Style id="polygonStyle">
        <LineStyle>
            <color>ff0000ff</color>
            <width>2.0</width>
        </LineStyle>
        <PolyStyle>
            <color>33ffff00</color>
            <fill>1</fill>
            <outline>1</outline>
        </PolyStyle>
    </Style>
    <Style id="lineStyle">
        <LineStyle>
            <color>ff0000ff</color>
            <width>3</width>
        </LineStyle>
    </Style>
    <Style id="pointStyle">
        <IconStyle>
            <scale>1.2</scale>
            <Icon>
                <href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href>
            </Icon>
        </IconStyle>
    </Style>
    <Style id="polygonPinStyle">
        <IconStyle>
            <scale>1.0</scale>
            <Icon>
                <href>http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png</href>
            </Icon>
        </IconStyle>
    </Style>`);

      let featureCount = 0;
      let skippedInvalidCoords = 0;
      let usedLatLonFallback = 0;
      let usedManualCenter = 0;
      let usedCenterAsMainGeometry = 0; // NEW: center dipakai sbg geometry utama (bukan cuma pin), krn WKT polygon gagal/kosong
      let duplicateWktRows = 0;
      let malformedWktRows = 0;
      let possiblyTruncatedByExcelCellLimit = 0; // NEW: WKT mendekati/kena batas 32.767 karakter per sel Excel
      let selfIntersectingRows = 0;
      let geometryAutoCorrectedRows = 0;
      let suspiciouslyLargeRows = 0;
      const seenWkt = new Set<string>();

      for (const row of records) {
        const rowWkt = wktColumn ? String(row[wktColumn] || '').trim() : '';

        if (rowWkt) {
          if (seenWkt.has(rowWkt)) {
            duplicateWktRows++;
          } else {
            seenWkt.add(rowWkt);
          }
        }

        let latVal = latColumn ? parseFloatVal(row[latColumn]) : null;
        let lonVal = lonColumn ? parseFloatVal(row[lonColumn]) : null;

        if (latVal !== null && lonVal !== null) {
          if (Math.abs(latVal) > 90 && Math.abs(lonVal) <= 90) {
            const temp = latVal;
            latVal = lonVal;
            lonVal = temp;
          }
        }

        const hasValidLatLon = isValidLatLon(latVal, lonVal);

        let geometry = '';
        let labelPoint: [number, number] | null = null;

        if (geometryMode === 'latlon') {
          if (!hasValidLatLon) {
            skippedInvalidCoords++;
            continue;
          }
          geometry = buildPointGeometry(lonVal as number, latVal as number);
        } else {
          if (rowWkt) {
            // WKT yg struktural rusak (kurung tak seimbang) di-skip, bukan dipaksa parse -- lihat catatan #9.
            if (isWellFormedWkt(rowWkt)) {
              const parsed = parseWktToKml(rowWkt);
              geometry = parsed.geometry;
              labelPoint = parsed.labelPoint;
              if (parsed.hasSelfIntersectingRing) selfIntersectingRows++;
              if (parsed.wasGeometryCorrected) geometryAutoCorrectedRows++;
              if (parsed.hasOversizedBoundingBox) suspiciouslyLargeRows++;
            } else {
              malformedWktRows++;
              // Sel Excel maksimal 32.767 karakter -- WKT polygon administrasi (kecamatan/kota/provinsi)
              // yg vertex-nya banyak sering terpotong PERSIS di batas ini saat file disimpan sbg .xlsx,
              // sehingga kurungnya jadi tak seimbang & lolos sbg "malformed". Dicatat terpisah utk diagnosa,
              // lihat juga catatan #14 di atas.
              if (isExcel && rowWkt.length >= 32760) {
                possiblyTruncatedByExcelCellLimit++;
              }
            }
          }

          // Resolusi center manual SEKALI per baris -- dipakai dobel di bawah: (a) override titik pin
          // kalau polygon berhasil diparse (perilaku lama), (b) fallback geometry utama kalau polygon
          // gagal/kosong (BARU -- lihat catatan #14).
          let manualCenterPt: [number, number] | null = null;
          if (centerColumn && row[centerColumn]) {
            const centerPt = extractWktPoint(row[centerColumn]);
            if (centerPt && isValidLatLon(centerPt[1], centerPt[0])) {
              manualCenterPt = centerPt;
            }
          } else if (centerLonColumn && centerLatColumn) {
            const centerPt = resolveCenterLatLon(row[centerLatColumn], row[centerLonColumn]);
            if (centerPt) {
              manualCenterPt = centerPt;
            }
          }

          if (geometry && manualCenterPt) {
            // Polygon berhasil diparse -> Center Polygon dipakai sbg titik pin, spt sebelumnya.
            labelPoint = manualCenterPt;
            usedManualCenter++;
          } else if (!geometry && manualCenterPt) {
            // Polygon gagal/kosong TAPI Center Polygon valid -> JANGAN skip baris ini.
            // Pakai Center Polygon sbg geometry utama (Point).
            geometry = buildPointGeometry(manualCenterPt[0], manualCenterPt[1]);
            labelPoint = null; // hindari 2 Placemark dobel persis di titik yg sama
            usedManualCenter++;
            usedCenterAsMainGeometry++;
          }

          if (!geometry && hasValidLatLon) {
            geometry = buildPointGeometry(lonVal as number, latVal as number);
            usedLatLonFallback++;
          } else if (!geometry && !hasValidLatLon) {
            skippedInvalidCoords++;
            continue;
          }
        }

        if (!geometry) {
          skippedInvalidCoords++;
          continue;
        }

        const name = escapeXmlText(String(row[nameColumn] || `Feature_${featureCount + 1}`));

        const descSegments: string[] = [];
        for (const col of descriptionColumns) {
          if (
            row[col] !== undefined &&
            col !== wktColumn &&
            col !== latColumn &&
            col !== lonColumn &&
            col !== nameColumn &&
            col !== centerColumn &&
            col !== centerLonColumn &&
            col !== centerLatColumn
          ) {
            const value = escapeXmlText(String(row[col] || ''));
            descSegments.push(`<strong>${escapeXmlText(col)}:</strong> ${value}`);
          }
        }

        const description = descSegments.length ? descSegments.join('<br/>') : '';

        // labelPoint terisi -> nama hanya di Placemark pin, bukan dobel.
        const mainPlacemarkName = labelPoint ? '' : name;

        kmlParts.push(`
    <Placemark>
        <name>${mainPlacemarkName}</name>
        <description><![CDATA[${description}]]></description>${geometry}
    </Placemark>`);
        featureCount++;

        if (labelPoint) {
          kmlParts.push(`
    <Placemark>
        <name>${name}</name>${buildPointGeometry(labelPoint[0], labelPoint[1], 'polygonPinStyle')}
    </Placemark>`);
        }
      }

      if (featureCount === 0) {
        return res.status(400).json({
          success: false,
          message: records.length === 0
            ? 'File tidak berisi baris data.'
            : 'Tidak ada baris yang menghasilkan geometry valid. Kemungkinan header kolom (WKT/Lat/Lon/Name) tidak terbaca dengan benar dari file ini, atau WKT terlalu panjang/rusak dan tidak ada kolom Center Polygon sbg fallback.',
          diagnostics: {
            totalRowsRead: records.length,
            detectedColumns: { wktColumn, latColumn, lonColumn, nameColumn, centerColumn, centerLatColumn, centerLonColumn },
            skippedInvalidCoords,
            malformedWktRows,
            possiblyTruncatedByExcelCellLimit,
            duplicateWktRows,
            sourceFileType: isExcel ? 'Excel' : 'CSV',
          },
        });
      }

      res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="converted_data_${dateStr}.kml"`
      );

      kmlParts.push(`
    <!-- Total features processed: ${featureCount}, skipped invalid coordinates: ${skippedInvalidCoords}, latlon fallback used: ${usedLatLonFallback}, manual center used: ${usedManualCenter} (as main geometry: ${usedCenterAsMainGeometry}), duplicate WKT rows: ${duplicateWktRows}, malformed WKT rows: ${malformedWktRows} (possibly truncated by Excel 32767-char cell limit: ${possiblyTruncatedByExcelCellLimit}), self-intersecting rings: ${selfIntersectingRows}, geometry auto-corrected rings: ${geometryAutoCorrectedRows}, suspiciously large rows: ${suspiciouslyLargeRows}, source file type: ${isExcel ? 'Excel' : 'CSV'}, CSV delimiter used: "${usedDelimiter}"${delimiterAutoCorrected ? ' (auto-corrected from initial guess "' + initialDelimiter + '")' : ''} -->
</Document>
</kml>`);

      res.send(kmlParts.join(''));
    } catch (error: any) {
      console.error('Error in WKT to KML converter:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: error.message || 'Terjadi kesalahan pada sistem.',
        });
      }
    }
  }
);

  // === 11. ENDPOINT POINT IN POLYGON ===
  app.post('/api/point-in-polygon', uploadMemory.fields([
    { name: 'points', maxCount: 1 },
    { name: 'polygons', maxCount: 1 }
  ]), async (req: any, res: any) => {
      try {
          const files = req.files as { [fieldname: string]: Express.Multer.File[] };
          
          if (!files || !files.points || !files.polygons) {
              return res.status(400).json({ success: false, message: 'File titik (points) dan poligon (polygons) KML wajib diunggah.' });
          }

          const getKmlString = (file: Express.Multer.File) => {
              const ext = file.originalname.toLowerCase().endsWith('.kmz') ? '.kmz' : '.kml';
              if (ext === '.kmz') {
                  const zip = new AdmZip(file.buffer);
                  const zipEntries = zip.getEntries();
                  const kmlEntry = zipEntries.find((entry: any) => entry.entryName.toLowerCase().endsWith('.kml'));
                  if (!kmlEntry) throw new Error('KML tidak ditemukan dalam file KMZ');
                  return kmlEntry.getData().toString('utf8');
              }
              return file.buffer.toString('utf8');
          };

          const pointsXml = getKmlString(files.points[0]);
          const polygonsXml = getKmlString(files.polygons[0]);

          const points = parseKMLPoints(pointsXml);
          const polygons = parseKMLPolygons(polygonsXml);

          const resultRows: any[] = [];
          for (const pt of points) {
              let foundPolygon = 'Polygon tidak ditemukan';
              
              for (const poly of polygons) {
                  if (pointInPolygon(pt, poly.coords)) {
                      foundPolygon = poly.name;
                      break;
                  }
              }

              resultRows.push({
                  point_name: pt.name,
                  latitude: pt.lat,
                  longitude: pt.lon,
                  polygon_name: foundPolygon
              });
          }

          const csvStringifier = createObjectCsvStringifier({
              header: [
                  { id: 'point_name', title: 'Point Name' },
                  { id: 'latitude', title: 'Latitude' },
                  { id: 'longitude', title: 'Longitude' },
                  { id: 'polygon_name', title: 'Polygon Name' }
              ]
          });

          const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(resultRows);
          const dateString = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
          const filename = `point_in_polygon_export_${dateString}.csv`;

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.status(200).send(csvContent);

      } catch (error: any) {
          console.error('Error in Point in Polygon:', error);
          if (!res.headersSent) {
              res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan sistem.' });
          }
      }
  });


  // === 12. ENDPOINT POLYGON IN POLYGON (POLYGON MAPPING) ===
  app.post('/api/polygon-in-polygon', uploadMemory.fields([
    { name: 'small_kml', maxCount: 1 },
    { name: 'big_kml', maxCount: 1 }
  ]), async (req: any, res: any) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files || !files.small_kml || !files.big_kml) {
        return res.status(400).json({ success: false, message: 'Harap upload file small_kml dan big_kml.' });
      }

      const smallFile = files.small_kml[0];
      const bigFile = files.big_kml[0];

      if (!smallFile.originalname.toLowerCase().endsWith('.kml') || !bigFile.originalname.toLowerCase().endsWith('.kml')) {
        return res.status(400).json({ success: false, message: 'Harap upload file dengan format KML.' });
      }

      const smallKMLContent = smallFile.buffer.toString('utf8');
      const bigKMLContent = bigFile.buffer.toString('utf8');

      if (!smallKMLContent || !bigKMLContent) {
        return res.status(400).json({ success: false, message: 'File KML kosong atau tidak dapat dibaca.' });
      }

      const data = pipProcessKMLMapping(smallKMLContent, bigKMLContent);

      const headers = ['nama_polygon_kecil', 'nama_polygon_besar', ...data.dynamic_columns];
      const cleanedHeaders = headers.map(h => pipCleanText(h));
      
      let csvContent = cleanedHeaders.join(',') + '\n';

      for (const row of data.results) {
        const csvRow = headers.map(header => {
          let value = row[header] !== undefined ? String(row[header]) : '';
          value = value.replace(/"/g, '""');
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            value = `"${value}"`;
          }
          return value;
        });
        csvContent += csvRow.join(',') + '\n';
      }

      const currentDate = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
      const filename = `hasil-mapping-polygon-${currentDate}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Pragma', 'no-cache');

      return res.status(200).send(csvContent);

    } catch (error: any) {
      console.error('Error Polygon in Polygon:', error);
      if (!res.headersSent) {
        return res.status(500).json({ 
          success: false, 
          message: error.message || 'Terjadi kesalahan sistem' 
        });
      }
    }
  });


  // === 12a. ENDPOINT CSV TO KML CONVERTER ===
  function csvKmlHexToColor(hex: string): string {
    let h = (hex || '#888888').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return 'ff888888';
    const r = h.substring(0, 2);
    const g = h.substring(2, 4);
    const b = h.substring(4, 6);
    return 'ff' + b + g + r;
  }

  interface CsvKmlIconConfig {
    iconUrl: string;
    color: string;
    iconScale: number;
    labelScale: number;
  }

  function csvKmlResolveIcon(
    statusValue: string,
    iconMapping: Record<string, CsvKmlIconConfig>
  ): CsvKmlIconConfig {
    const fallback: CsvKmlIconConfig = {
      iconUrl: 'http://maps.google.com/mapfiles/kml/paddle/wht-blank.png',
      color: '#888888',
      iconScale: 1.0,
      labelScale: 0.8,
    };
    if (iconMapping[statusValue]) return iconMapping[statusValue];
    const upper = String(statusValue ?? '').trim().toUpperCase();
    const match = Object.keys(iconMapping).find((k) => k.toUpperCase() === upper);
    if (match) return iconMapping[match];
    return iconMapping['DEFAULT'] || fallback;
  }

  function csvKmlStyleId(statusValue: string): string {
    return 's_' + String(statusValue ?? 'default').replace(/[^a-zA-Z0-9_]/g, '_');
  }

  function csvKmlGroupByHierarchy(data: Record<string, string>[], levels: string[]): any {
    if (levels.length === 0) return data;
    const [field, ...rest] = levels;
    const grouped: Record<string, Record<string, string>[]> = {};
    data.forEach((row) => {
      let key = row[field] ?? 'UNKNOWN';
      if (key === '') key = 'UNKNOWN';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });
    const result: Record<string, any> = {};
    Object.entries(grouped).forEach(([key, rows]) => {
      result[key] = csvKmlGroupByHierarchy(rows, rest);
    });
    return result;
  }

  function csvKmlBuildPlacemark(
    row: Record<string, string>,
    mapping: { lat: string; lng: string; title: string; status?: string; description?: string[] }
  ): string {
    const title = escapeXmlText(String(row[mapping.title] ?? 'Untitled'));

    let descriptionTag = '';
    if (mapping.description && mapping.description.length > 0) {
      const lines: string[] = [];
      mapping.description.forEach((df) => {
        if (row[df] !== undefined && row[df] !== '') {
          lines.push(`${df}: ${row[df]}`);
        }
      });
      if (lines.length > 0) {
        descriptionTag = `\n      <description>${escapeXmlText(lines.join('\n'))}</description>`;
      }
    }

    const statusValue = mapping.status ? (row[mapping.status] || 'DEFAULT') || 'DEFAULT' : 'DEFAULT';
    const styleId = csvKmlStyleId(statusValue === '' ? 'DEFAULT' : statusValue);

    const lat = parseFloatVal(row[mapping.lat]) || 0;
    const lng = parseFloatVal(row[mapping.lng]) || 0;

    let extendedData = '\n      <ExtendedData>';
    Object.entries(row).forEach(([field, value]) => {
      const safeName = field.replace(/[^a-zA-Z0-9_-]/g, '_');
      extendedData += `\n        <Data name="${safeName}"><value>${escapeXmlText(String(value ?? ''))}</value></Data>`;
    });
    extendedData += '\n      </ExtendedData>';

    return `\n    <Placemark>\n      <name>${title}</name>\n      <visibility>0</visibility>${descriptionTag}\n      <styleUrl>#${styleId}</styleUrl>\n      <Point>\n        <coordinates>${lng},${lat},0</coordinates>\n        <altitudeMode>clampToGround</altitudeMode>\n      </Point>${extendedData}\n    </Placemark>`;
  }

  function csvKmlIsIndexedArray(value: any): boolean {
    return Array.isArray(value);
  }

  function csvKmlBuildFolders(
    grouped: any,
    mapping: { lat: string; lng: string; title: string; status?: string; description?: string[] }
  ): string {
    let xml = '';
    Object.entries(grouped).forEach(([key, value]) => {
      if (csvKmlIsIndexedArray(value)) {
        (value as Record<string, string>[]).forEach((row) => {
          xml += csvKmlBuildPlacemark(row, mapping);
        });
      } else {
        xml += `\n    <Folder>\n      <name>${escapeXmlText(key)}</name>\n      <visibility>0</visibility>\n      <open>0</open>${csvKmlBuildFolders(value, mapping)}\n    </Folder>`;
      }
    });
    return xml;
  }

  app.post('/api/csv-to-kml', uploadMemory.single('csv_file'), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'File CSV wajib diunggah.' });
      }

      let config: any = {};
      try {
        config = req.body.config ? JSON.parse(req.body.config) : {};
      } catch {
        return res.status(400).json({ success: false, message: 'Konfigurasi tidak valid.' });
      }

      const mapping = config.mapping || {};
      const folderLevels: string[] = Array.isArray(config.folderLevels) ? config.folderLevels : [];
      const filters: string[] = Array.isArray(config.filters) ? config.filters : [];
      const filename = String(config.filename || 'output').trim() || 'output';
      const format = config.format === 'kmz' ? 'kmz' : 'kml';
      const iconMapping: Record<string, CsvKmlIconConfig> = config.iconMapping || {};

      if (!mapping.lat || !mapping.lng || !mapping.title) {
        return res.status(400).json({ success: false, message: 'Lat, Lng, dan Title wajib dipetakan.' });
      }

const fileExt = (req.file.originalname.split('.').pop() || '').toLowerCase();
      let allRows: Record<string, string>[] = [];

      if (fileExt === 'csv') {
        // Logika untuk file CSV
        let csvText = req.file.buffer.toString('utf8');
        csvText = csvText.replace(/^\uFEFF/, '');
        const delimiter = detectCsvDelimiter(csvText);

        allRows = parseCsvSync(csvText, {
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
          bom: true,
          trim: true,
          delimiter,
        });
      } else if (fileExt === 'xlsx' || fileExt === 'xls') {
        // Logika untuk file Excel (.xlsx / .xls)
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // Ambil data dari sheet pertama
        
        // Convert sheet ke JSON. defval: '' memastikan cell kosong terbaca sebagai string kosong
        // raw: false memastikan nilai seperti tanggal/angka terformat dengan benar sebagai string
        const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
        
        // Pastikan tipe kembaliannya konsisten (Record<string, string>) seperti CSV parser
        allRows = rawRows.map((row: any) => {
          const stringifiedRow: Record<string, string> = {};
          for (const key in row) {
            stringifiedRow[key] = String(row[key]);
          }
          return stringifiedRow;
        });
      } else {
        return res.status(400).json({ 
          success: false, 
          message: 'Format file tidak didukung. Harap upload file .csv, .xls, atau .xlsx' 
        });
      }
   
      let skipped = 0;
      const data = allRows.filter((row) => {
        const lat = parseFloatVal(row[mapping.lat]) || 0;
        const lng = parseFloatVal(row[mapping.lng]) || 0;
        const validCoords = !(lat === 0 && lng === 0) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
        if (!validCoords) {
          skipped++;
          return false;
        }
        if (mapping.status && filters.length > 0) {
          const sv = row[mapping.status] ?? '';
          if (!filters.includes(sv)) return false;
        }
        return true;
      });

      if (data.length === 0) {
        return res.status(400).json({ success: false, message: `Tidak ada data valid. Baris dilewati: ${skipped}` });
      }

      const statusValues = new Set<string>();
      if (mapping.status) {
        data.forEach((row) => {
          const sv = row[mapping.status] || 'DEFAULT';
          statusValues.add(sv === '' ? 'DEFAULT' : sv);
        });
      }
      statusValues.add('DEFAULT');

      let stylesXml = '';
      statusValues.forEach((sv) => {
        const cfg = csvKmlResolveIcon(sv, iconMapping);
        const styleId = csvKmlStyleId(sv);
        const iconColor = csvKmlHexToColor(cfg.color);
        const iconScale = Number(cfg.iconScale) || 1.0;
        const labelScale = Number(cfg.labelScale) || 0.8;
        stylesXml += `\n    <Style id="${styleId}">\n      <IconStyle>\n        <color>${iconColor}</color>\n        <scale>${iconScale}</scale>\n        <Icon><href>${cfg.iconUrl}</href></Icon>\n        <hotSpot x="32" y="1" xunits="pixels" yunits="pixels"/>\n      </IconStyle>\n      <LabelStyle>\n        <color>ffffffff</color>\n        <scale>${labelScale}</scale>\n      </LabelStyle>\n    </Style>`;
      });

      let bodyXml = '';
      if (folderLevels.length === 0) {
        data.forEach((row) => {
          bodyXml += csvKmlBuildPlacemark(row, mapping);
        });
      } else {
        const grouped = csvKmlGroupByHierarchy(data, folderLevels);
        bodyXml += csvKmlBuildFolders(grouped, mapping);
      }

      const kmlContent =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<kml xmlns="http://www.opengis.net/kml/2.2">\n` +
        `  <Document>\n` +
        `    <name>${escapeXmlText(filename)}</name>\n` +
        `    <visibility>0</visibility>\n` +
        `    <open>0</open>${stylesXml}${bodyXml}\n` +
        `  </Document>\n` +
        `</kml>`;

      const safeFilename = filename.replace(/[^a-zA-Z0-9_\-.\s]/g, '').trim() || 'output';

      if (format === 'kmz') {
        const zip = new AdmZip();
        zip.addFile('doc.kml', Buffer.from(kmlContent, 'utf8'));
        const kmzBuffer = zip.toBuffer();
        res.setHeader('Content-Type', 'application/vnd.google-earth.kmz');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.kmz"`);
        return res.send(kmzBuffer);
      } else {
        res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.kml"`);
        return res.send(kmlContent);
      }
    } catch (error: any) {
      console.error('Error CSV to KML:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan pada server.' });
      }
    }
  });


  // === 13. FRONTEND VITE / STATIC SERVE ===
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();