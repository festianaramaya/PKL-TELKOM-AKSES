import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/OdpForm.css';

interface KeteranganFormData {
  fileName: string;
  category: string;
}

export const KeteranganTaggingForm: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<KeteranganFormData>({
    fileName: '',
    category: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Pastikan nama file diakhiri dengan .kml jika user lupa mengetiknya
    let finalFileName = formData.fileName.trim();
    if (finalFileName && !finalFileName.toLowerCase().endsWith('.kml')) {
      finalFileName += '.kml';
    }

    console.log("Data Disimpan:", {
      ...formData,
      fileName: finalFileName,
    });

    // Kembali ke peta tagging setelah menyimpan
    navigate('/tagging');
  };

  const handleBatal = () => {
    navigate('/tagging');
  };

  return (
    <MainLayout pageTitle="Simpan hasil Tagging" activeMenu="tagging">
      <div className="odp-container">
        <div className="odp-card">
          {/* Header Banner */}
          <div className="odp-header-banner">
            <div className="odp-icon-box">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <span className="odp-header-title">INPUT NAMA FILE AKHIR (.KML)</span>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="odp-form-body">
            {/* Field Input Nama File */}
            <div className="odp-field-group">
              <label htmlFor="fileName">INPUT NAMA FILE AKHIR (.KML)</label>
              <input
                type="text"
                id="fileName"
                name="fileName"
                placeholder="nama_file.kml"
                value={formData.fileName}
                onChange={handleChange}
                required
              />
            </div>

            {/* Field Category
            <div className="odp-field-group">
              <label htmlFor="category">PILIH CATEGORY</label>
              <div className="select-wrapper">
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className={!formData.category ? 'placeholder-selected' : ''}
                  required
                >
                  <option value="" disabled hidden>
                    PILIH CATEGORY
                  </option>
                  <option value="Survey">Survey</option>
                  <option value="Pengukuran">Pengukuran</option>
                  <option value="Validasi Field">Validasi Field</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
                <span className="custom-arrow">▼</span>
              </div>
            </div> */}

            {/* Form Actions */}
            <div className="odp-button-group">
              <button
                type="button"
                className="btn-odp-batal"
                onClick={handleBatal}
              >
                Batal
              </button>
              <button type="submit" className="btn-odp-simpan">
                Simpan
              </button>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default KeteranganTaggingForm;