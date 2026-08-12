import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/OdpForm.css';

interface TiangFormData {
  tipe: string;
}

export const TiangForm: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<TiangFormData>({
    tipe: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Data Tiang Disimpan:", formData);
    navigate('/tagging');
  };

  const handleBatal = () => {
    navigate('/tagging');
  };

  return (
    <MainLayout pageTitle="Tagging Tiang" activeMenu="tagging">
      <div className="odp-container">
        <div className="odp-card">
          {/* Form Body */}
          <form onSubmit={handleSubmit} className="odp-form-body">
            {/* Field Tipe (Dropdown Tiang Eksisting) */}
            <div className="odp-field-group">
              <label htmlFor="tipe">Tipe</label>
              <div className="select-wrapper">
                <select
                  id="tipe"
                  name="tipe"
                  value={formData.tipe}
                  onChange={handleChange}
                  className={!formData.tipe ? 'placeholder-selected' : ''}
                >
                  <option value="" disabled hidden>
                    Pilih Tiang Eksisting
                  </option>
                  <option value="Tiang 7 Meter">Tiang 7 Meter</option>
                  <option value="Tiang 9 Meter">Tiang 9 Meter</option>
                  <option value="Tiang 12 Meter">Tiang 12 Meter</option>
                </select>
                <span className="custom-arrow">▼</span>
              </div>
            </div>

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

export default TiangForm;