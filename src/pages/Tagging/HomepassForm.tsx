import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/OdpForm.css';

interface HomepassFormData {
  noRumah: string;
  keterangan: string;
}

export const HomepassForm: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<HomepassFormData>({
    noRumah: '',
    keterangan: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Data Homepass Disimpan:", formData);
    navigate('/tagging');
  };

  const handleBatal = () => {
    navigate('/tagging');
  };

  return (
    <MainLayout pageTitle="Tagging Homepass" activeMenu="tagging">
      <div className="odp-container">
        <div className="odp-card">

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="odp-form-body">
            {/* Field No Rumah */}
            <div className="odp-field-group">
              <label htmlFor="noRumah">No Rumah</label>
              <input
                type="text"
                id="noRumah"
                name="noRumah"
                placeholder="Text"
                value={formData.noRumah}
                onChange={handleChange}
              />
            </div>

            {/* Field Keterangan */}
            <div className="odp-field-group">
              <label htmlFor="keterangan">Keterangan</label>
              <input
                type="text"
                id="keterangan"
                name="keterangan"
                placeholder="Text"
                value={formData.keterangan}
                onChange={handleChange}
              />
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

export default HomepassForm;