import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

const kmlText = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Style id="redLine">
      <LineStyle>
        <color>ff0000ff</color>
        <width>2</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>DS-LMG-FE-09-08/01-05-01</name>
      <styleUrl>#redLine</styleUrl>
      <LineString>
        <coordinates>112.324, -7.194 112.325, -7.195</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

const parser = new DOMParser();
const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
console.log(JSON.stringify(kml(xmlDoc), null, 2));
