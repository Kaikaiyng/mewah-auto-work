import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AlertCircle, ArrowLeft, FileText, Upload, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { toast } from 'sonner';
import { MobileDatePicker } from '../components/ui/mobile-date-picker';
import { MobileCombobox } from '../components/ui/mobile-combobox';
import { MobileSelect } from '../components/ui/mobile-select';
import { VehicleCreatedDocumentUploadError } from '../lib/api';

const equipmentTypes = [
  'Prime Mover',
  'Container Chassis / Skeletal Trailer',
  'Side Loader / Sidelifter',
  'Other',
];
const containerLengths = ['20 ft', '40 ft', '45 ft', '20/40 ft Extendable', 'Other'];
const axleConfigurations = ['2 Axle', '3 Axle', 'Other'];
const primeMoverBrandModels: Record<string, string[]> = {
  'Volvo Trucks': ['FH', 'FH16', 'FM', 'FMX'],
  Scania: ['P-series', 'G-series', 'G450', 'R-series', 'R450', 'S-series'],
  MAN: ['TGM', 'TGS', 'TGX'],
  'Mercedes-Benz Trucks': ['Atego', 'Actros', 'Arocs'],
  'UD Trucks': ['Kuzer', 'Croner', 'Quester', 'Quester CGE', 'Quester CWE'],
  Hino: ['300 Series', '500 Series', '700 Series', 'Profia', 'Ranger'],
  Isuzu: ['N-Series', 'F-Series', 'GIGA', 'Forward', 'ELF'],
  FUSO: ['Canter', 'Fighter', 'Super Great'],
  'Sinotruk / HOWO': ['HOWO A7', 'HOWO T7H', 'HOWO TX', 'HOWO MAX', 'SITRAK C7H', 'SITRAK G7'],
  Shacman: ['F3000', 'X3000', 'X5000', 'M3000'],
  'Foton / Auman': ['EST-A', 'EST', 'GTL', 'ETX'],
  Dongfeng: ['Tianlong', 'KX', 'KL', 'KR', 'Captain'],
  JAC: ['Gallop', 'K7', 'N-Series'],
  Other: [],
};

const sideLoaderBrands = ['Hammar', 'Steelbro', 'Swinglift', 'Combilift', 'Other'];
const commonBrands = [...Object.keys(primeMoverBrandModels), ...sideLoaderBrands];
const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ');
const normalizedBrandAliases: Record<string, string> = {
  'nissan ud': 'UD Trucks',
  'ud truck': 'UD Trucks',
  'mitsubishi fuso': 'FUSO',
  volvo: 'Volvo Trucks',
  'mercedes-benz': 'Mercedes-Benz Trucks',
  'mercedes benz': 'Mercedes-Benz Trucks',
  'sinotruk/howo': 'Sinotruk / HOWO',
  'sinotruk / howo': 'Sinotruk / HOWO',
  howo: 'Sinotruk / HOWO',
  foton: 'Foton / Auman',
  auman: 'Foton / Auman',
  'foton auman': 'Foton / Auman',
};

const normalizeBrandName = (value: string) => {
  const normalizedValue = normalizeText(value);
  const key = normalizedValue.toLocaleLowerCase();
  return normalizedBrandAliases[key]
    || commonBrands.find((brand) => brand.toLocaleLowerCase() === key)
    || normalizedValue;
};

const uniqueCaseInsensitive = (values: string[]) => {
  const uniqueValues = new Map<string, string>();

  values.forEach((value) => {
    const normalizedValue = normalizeText(value);
    if (normalizedValue) {
      const key = normalizedValue.toLocaleLowerCase();
      if (!uniqueValues.has(key)) {
        uniqueValues.set(key, normalizedValue);
      }
    }
  });

  return [...uniqueValues.values()];
};

const canonicalizeSuggestion = (value: string, suggestions: string[]) => {
  const normalizedValue = normalizeText(value);
  return suggestions.find(
    (suggestion) => suggestion.toLocaleLowerCase() === normalizedValue.toLocaleLowerCase(),
  ) || normalizedValue;
};

const canonicalizeBrand = (value: string, suggestions: string[]) => {
  const normalizedValue = normalizeBrandName(value);
  return suggestions.find(
    (suggestion) => suggestion.toLocaleLowerCase() === normalizedValue.toLocaleLowerCase(),
  ) || normalizedValue;
};

const normalizeEquipmentProfile = (equipment: string, existingContainerLength = '') => {
  const normalizedEquipment = normalizeText(equipment);
  const key = normalizedEquipment.toLocaleLowerCase();
  const chassisMappings: Record<string, string> = {
    '20 ft trailer': '20 ft',
    '20 ft container chassis': '20 ft',
    '40 ft trailer': '40 ft',
    "40's trailer": '40 ft',
    '40 ft container chassis': '40 ft',
    '45 ft container chassis': '45 ft',
    '20/40 ft extendable container chassis': '20/40 ft Extendable',
  };

  if (chassisMappings[key]) {
    return {
      equipment: 'Container Chassis / Skeletal Trailer',
      containerLength: existingContainerLength || chassisMappings[key],
    };
  }
  if (key === 'sidelifter' || key === 'side loader' || key === 'side loader / sidelifter') {
    return { equipment: 'Side Loader / Sidelifter', containerLength: existingContainerLength };
  }
  return { equipment: normalizedEquipment, containerLength: existingContainerLength };
};

const initialForm = {
  equipment: '',
  brand: '',
  model: '',
  regNo: '',
  vehicleStatus: 'Active',
  year: '',
  mileage: '',
  chassisNo: '',
  engineNo: '',
  containerLength: '',
  axleConfiguration: '',
  insuranceExpiry: '',
  roadTaxExpiry: '',
  puspakomExpiry: '',
};

export function AddVehicleScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editVehicleId = searchParams.get('editVehicleId');
  const { t } = useLanguage();
  const { data, createVehicle, reload } = useCustomerData();
  const [formData, setFormData] = useState(initialForm);
  const [documents, setDocuments] = useState<{
    insurance?: File;
    roadTax?: File;
    puspakom?: File;
  }>({});
  const [isSaving, setIsSaving] = useState(false);
  const isPrimeMover = formData.equipment === 'Prime Mover';
  const isContainerChassis = formData.equipment === 'Container Chassis / Skeletal Trailer';
  const isSideLoader = formData.equipment === 'Side Loader / Sidelifter';
  const showMileage = !isContainerChassis;
  const showEngineNumber = isPrimeMover;

  const customerVehicles = data?.user.vehicles;
  const editingVehicle = useMemo(() => {
    if (!editVehicleId || !customerVehicles) return null;
    return customerVehicles.find(
      (v) => String(v.id) === String(editVehicleId)
        || String(v.id) === `v${editVehicleId}`
        || `v${v.id}` === String(editVehicleId),
    ) || null;
  }, [customerVehicles, editVehicleId]);

  useEffect(() => {
    if (editingVehicle) {
      setFormData({
        equipment: editingVehicle.equipment || '',
        brand: editingVehicle.brand || '',
        model: editingVehicle.model || '',
        regNo: editingVehicle.plate || editingVehicle.regNo || '',
        vehicleStatus: editingVehicle.vehicleStatus || 'Active',
        year: editingVehicle.year ? String(editingVehicle.year) : '',
        mileage: editingVehicle.mileage ? String(editingVehicle.mileage) : '',
        chassisNo: editingVehicle.chassisNo || '',
        engineNo: editingVehicle.engineNo || '',
        containerLength: editingVehicle.containerLength || '',
        axleConfiguration: editingVehicle.axleConfiguration || '',
        insuranceExpiry: editingVehicle.insuranceExpiry || '',
        roadTaxExpiry: editingVehicle.roadTaxExpiry || '',
        puspakomExpiry: editingVehicle.puspakomExpiry || '',
      });
    }
  }, [editingVehicle]);

  const existingBrands = useMemo(
    () => uniqueCaseInsensitive((customerVehicles || []).map((vehicle) => normalizeBrandName(vehicle.brand))),
    [customerVehicles],
  );
  const brandSuggestions = useMemo(() => {
    const savedBrandsForType = (customerVehicles || [])
      .filter((vehicle) => normalizeEquipmentProfile(vehicle.equipment).equipment === formData.equipment)
      .map((vehicle) => normalizeBrandName(vehicle.brand));

    if (isPrimeMover) {
      return uniqueCaseInsensitive([...Object.keys(primeMoverBrandModels), ...savedBrandsForType]);
    }
    if (isContainerChassis) {
      return uniqueCaseInsensitive(savedBrandsForType);
    }
    if (isSideLoader) {
      return uniqueCaseInsensitive([...sideLoaderBrands, ...savedBrandsForType]);
    }
    return uniqueCaseInsensitive([...commonBrands, ...existingBrands]);
  }, [customerVehicles, existingBrands, formData.equipment, isContainerChassis, isPrimeMover, isSideLoader]);

  const modelSuggestions = useMemo(() => {
    const selectedBrand = canonicalizeBrand(formData.brand, brandSuggestions);
    if (selectedBrand) {
      const standardBrand = Object.keys(primeMoverBrandModels).find(
        (brand) => brand.toLocaleLowerCase() === selectedBrand.toLocaleLowerCase(),
      );
      const savedModels = (customerVehicles || [])
        .filter((vehicle) => {
          const sameEquipment = normalizeEquipmentProfile(vehicle.equipment).equipment === formData.equipment;
          const sameBrand = normalizeBrandName(vehicle.brand).toLocaleLowerCase() === selectedBrand.toLocaleLowerCase();
          return sameEquipment && sameBrand;
        })
        .map((vehicle) => vehicle.model);

      const brandPresetModels = isPrimeMover && standardBrand ? (primeMoverBrandModels[standardBrand] || []) : [];
      if (brandPresetModels.length > 0 || savedModels.length > 0) {
        return uniqueCaseInsensitive([
          ...brandPresetModels,
          ...(isContainerChassis ? ['3-Axle Skeletal Chassis', 'Extendable Chassis', '2-Axle Skeletal Chassis', '40ft Skeletal Trailer', '20ft Skeletal Trailer'] : []),
          ...(isSideLoader ? ['Hammar 195', 'Hammar 155', 'Steelbro SB450', 'Steelbro SB362', 'Swinglift', 'Combilift'] : []),
          ...savedModels,
        ]);
      }
    }

    // Default fallback: Always show preset models when brand is not selected or has no specific list
    const allPrimeMoverModels = Object.values(primeMoverBrandModels).flat();
    const savedModels = (customerVehicles || [])
      .filter((vehicle) => !formData.equipment || normalizeEquipmentProfile(vehicle.equipment).equipment === formData.equipment)
      .map((vehicle) => vehicle.model);

    if (isContainerChassis) {
      return uniqueCaseInsensitive([
        '3-Axle Skeletal Chassis',
        'Extendable Chassis',
        '2-Axle Skeletal Chassis',
        '40ft Skeletal Trailer',
        '20ft Skeletal Trailer',
        'Lowbed Trailer',
        'Flatbed Trailer',
        ...savedModels,
      ]);
    }
    if (isSideLoader) {
      return uniqueCaseInsensitive([
        'Hammar 195',
        'Hammar 155',
        'Steelbro SB450',
        'Steelbro SB362',
        'Swinglift',
        'Combilift',
        ...savedModels,
      ]);
    }

    return uniqueCaseInsensitive([
      ...allPrimeMoverModels,
      '3-Axle Skeletal Chassis',
      'Extendable Chassis',
      'Hammar 195',
      'Steelbro SB450',
      ...savedModels,
    ]);
  }, [brandSuggestions, customerVehicles, formData.brand, formData.equipment, isContainerChassis, isPrimeMover, isSideLoader]);

  const handleChange = (field: keyof typeof initialForm, value: string) => {
    setFormData((previous) => {
      if (field === 'model') {
        let brand = previous.brand;
        if (!brand) {
          // Auto detect brand from model if known
          for (const [bName, models] of Object.entries(primeMoverBrandModels)) {
            if (models.some((m) => m.toLowerCase() === value.toLowerCase())) {
              brand = bName;
              break;
            }
          }
        }
        return { ...previous, model: value, brand };
      }

      if (field !== 'equipment') {
        return { ...previous, [field]: value };
      }

      return {
        ...previous,
        equipment: value,
        ...(value === 'Container Chassis / Skeletal Trailer'
          ? { mileage: '', engineNo: '' }
          : { containerLength: '', axleConfiguration: '' }),
        ...(value !== 'Prime Mover' ? { engineNo: '' } : {}),
      };
    });
  };

  const handleSubmit = async () => {
    const normalizedBrand = canonicalizeBrand(formData.brand, brandSuggestions);
    const normalizedModel = canonicalizeSuggestion(formData.model, modelSuggestions);

    if (!formData.equipment || !formData.regNo.trim()) {
      toast.error(t(
        'Equipment type and registration number are required.',
        'Jenis peralatan dan nombor pendaftaran diperlukan.',
        '设备类型和车牌号码为必填项。',
      ));
      return;
    }
    if (isPrimeMover && (!normalizedBrand || !normalizedModel)) {
      toast.error(t(
        'Prime Mover brand and model are required.',
        'Jenama dan model Prime Mover diperlukan.',
        'Prime Mover 品牌和型号为必填项。',
      ));
      return;
    }
    if (isContainerChassis && (!formData.containerLength || !formData.axleConfiguration)) {
      toast.error(t(
        'Container length and axle configuration are required.',
        'Panjang kontena dan konfigurasi gandar diperlukan.',
        'Container Length 和 Axle Configuration 为必填项。',
      ));
      return;
    }
    const currentYear = new Date().getFullYear();
    if (formData.year && (!/^\d{4}$/.test(formData.year) || Number(formData.year) < 1900 || Number(formData.year) > currentYear + 1)) {
      toast.error(t(
        `Manufacture year must be between 1900 and ${currentYear + 1}.`,
        `Tahun pembuatan mestilah antara 1900 dan ${currentYear + 1}.`,
        `制造年份必须介于 1900 至 ${currentYear + 1} 年之间。`,
      ));
      return;
    }
    if (formData.mileage && !/^\d+$/.test(formData.mileage)) {
      toast.error(t(
        'Current mileage must be a non-negative whole number.',
        'Perbatuan semasa mestilah nombor bulat bukan negatif.',
        '当前里程必须是非负整数。',
      ));
      return;
    }
    const hasExistingInsuranceDoc = Boolean(editingVehicle?.insuranceExpiry);
    const hasExistingRoadTaxDoc = Boolean(editingVehicle?.roadTaxExpiry);
    const insuranceDocProvided = Boolean(documents.insurance || hasExistingInsuranceDoc);
    const roadTaxDocProvided = Boolean(documents.roadTax || hasExistingRoadTaxDoc);

    if (!formData.insuranceExpiry || !insuranceDocProvided || !formData.roadTaxExpiry || !roadTaxDocProvided) {
      toast.error(t(
        'Insurance and Road Tax expiry dates and documents are required.',
        'Tarikh tamat dan dokumen Insurans serta Cukai Jalan diperlukan.',
        '保险和路税的到期日期及证件文件为必填项。',
      ));
      return;
    }
    const hasExistingPuspakomDoc = Boolean(editingVehicle?.puspakomExpiry);
    const puspakomDocProvided = Boolean(documents.puspakom || hasExistingPuspakomDoc);
    if ((formData.puspakomExpiry && !puspakomDocProvided) || (!formData.puspakomExpiry && documents.puspakom)) {
      toast.error(t(
        'Provide both the PUSPAKOM expiry date and document.',
        'Sediakan tarikh tamat dan dokumen PUSPAKOM.',
        '请同时填写 PUSPAKOM 到期日期并上传文件。',
      ));
      return;
    }

    setIsSaving(true);
    try {
      await createVehicle({
        equipment: formData.equipment,
        brand: normalizedBrand,
        model: normalizedModel,
        containerLength: formData.containerLength,
        axleConfiguration: formData.axleConfiguration,
        regNo: formData.regNo.trim().toUpperCase(),
        vehicleStatus: formData.vehicleStatus,
        year: Number(formData.year) || 0,
        mileage: Number(formData.mileage) || 0,
        chassisNo: formData.chassisNo.trim().toUpperCase(),
        engineNo: formData.engineNo.trim().toUpperCase(),
        insuranceExpiry: formData.insuranceExpiry || undefined,
        roadTaxExpiry: formData.roadTaxExpiry || undefined,
        puspakomExpiry: formData.puspakomExpiry || undefined,
        insuranceDocument: documents.insurance,
        roadTaxDocument: documents.roadTax,
        puspakomDocument: documents.puspakom,
      });
      toast.success(editingVehicle?.verificationStatus === 'rejected' ? t(
        'Vehicle re-submitted for verification.',
        'Kenderaan dihantar semula untuk pengesahan.',
        '车辆已重新提交审核。',
      ) : t(
        'Vehicle submitted for verification.',
        'Kenderaan dihantar untuk pengesahan.',
        '车辆已提交审核。',
      ));
      navigate('/vehicles');
    } catch (caught) {
      if (caught instanceof VehicleCreatedDocumentUploadError) {
        await reload({ silent: true });
        toast.warning(t(
          'Vehicle saved, but a document upload failed. Please retry from Vehicle Details.',
          'Kenderaan disimpan, tetapi muat naik dokumen gagal. Sila cuba semula dari Maklumat Kenderaan.',
          '车辆已保存，但证件上传失败，请在车辆详情中重新上传。',
        ));
        navigate(`/vehicle/${caught.vehicleId}`);
        return;
      }
      toast.error(caught instanceof Error ? caught.message : t(
        'Unable to save vehicle.',
        'Tidak dapat menyimpan kenderaan.',
        '无法保存车辆。',
      ));
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass = 'h-12 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400';

  return (
    <div className="min-h-screen bg-[#eef3fb] pb-32 max-w-md mx-auto">
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {editingVehicle?.verificationStatus === 'rejected'
            ? t('Re-submit Vehicle', 'Hantar Semula Kenderaan', '重新提交车辆')
            : t('Add New Vehicle', 'Tambah Kenderaan Baru', '添加新车辆')}
        </h1>
        <div className="w-10" />
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">
        {editingVehicle?.verificationStatus === 'rejected' ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{t('Vehicle Rejected - Please Update Details', 'Kenderaan Ditolak - Sila Kemaskini Maklumat', '车辆审核未通过 - 请更新资料')}</span>
            </div>
            {editingVehicle.rejectionReason && (
              <p className="text-xs text-red-700 font-medium pl-6">
                {t('Reason: ', 'Sebab: ', '原因：')}{editingVehicle.rejectionReason}
              </p>
            )}
            <p className="text-xs text-red-600 pl-6">
              {t('Update the necessary details or re-upload documents, then re-submit for admin verification.', 'Kemaskini maklumat berkaitan atau muat naik semula dokumen, kemudian hantar semula untuk pengesahan admin.', '更新相关信息或重新上传证件后，重新提交管理员审核。')}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t(
              'New vehicles will appear immediately with Pending Verification status.',
              'Kenderaan baru akan dipaparkan serta-merta dengan status Menunggu Pengesahan.',
              '新车辆会立即显示，并标记为“待审核”。',
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>{t('Equipment Type', 'Jenis Peralatan', '设备类型')} *</Label>
          <MobileSelect
            value={formData.equipment}
            onChange={(event) => handleChange('equipment', event.target.value)}
            title={t('Select equipment type', 'Pilih jenis peralatan', '选择设备类型')}
            description={t('Choose the vehicle or equipment category', 'Pilih kategori kenderaan atau peralatan', '选择车辆或设备类别')}
            className={fieldClass}
          >
            <option value="">{t('Select equipment type', 'Pilih jenis peralatan', '选择设备类型')}</option>
            {equipmentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </MobileSelect>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label={t('Registration / Plate No.', 'No. Pendaftaran / Plat', '注册 / 车牌号码')}
            required
            value={formData.regNo}
            onChange={(value) => handleChange('regNo', value)}
            placeholder="e.g. WKL 1234"
            uppercase
          />
          <TextField
            label={t('Manufacture Year', 'Tahun Pembuatan', '制造年份')}
            value={formData.year}
            onChange={(value) => handleChange('year', value)}
            placeholder="e.g. 2020"
            type="number"
            min={1900}
            max={new Date().getFullYear() + 1}
            numericOnly
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>
              {t('Brand / Manufacturer', 'Jenama / Pengilang', '品牌 / 制造商')}
              <span className={`inline-block w-2 ${isPrimeMover ? '' : 'invisible'}`} aria-hidden="true"> *</span>
            </Label>
            <MobileCombobox
              ariaLabel={t('Choose or enter a vehicle brand', 'Pilih atau masukkan jenama kenderaan', '选择或输入车辆品牌')}
              title={t('Select vehicle brand', 'Pilih jenama kenderaan', '选择车辆品牌')}
              description={t('Search the list or enter a custom brand', 'Cari dalam senarai atau masukkan jenama sendiri', '搜索列表或输入自定义品牌')}
              customLabel={t('Use custom brand', 'Gunakan jenama sendiri', '使用自定义品牌')}
              searchPlaceholder={t('Search or enter a brand...', 'Cari atau masukkan jenama...', '搜索或输入品牌…')}
              value={formData.brand}
              onChange={(value) => handleChange('brand', canonicalizeBrand(value, brandSuggestions))}
              options={brandSuggestions}
              placeholder={isContainerChassis
                ? t('Optional local or custom manufacturer', 'Pengilang tempatan atau khusus (pilihan)', '可选本地或自定义制造商')
                : isPrimeMover
                  ? 'e.g. Volvo Trucks'
                  : t('Optional brand', 'Jenama pilihan', '可选品牌')}
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t('Model / Series', 'Model / Siri', '型号 / 系列')}
              <span className={`inline-block w-2 ${isPrimeMover ? '' : 'invisible'}`} aria-hidden="true"> *</span>
            </Label>
            <MobileCombobox
              ariaLabel={t('Choose or enter a vehicle model', 'Pilih atau masukkan model kenderaan', '选择或输入车辆型号')}
              title={t('Select vehicle model', 'Pilih model kenderaan', '选择车辆型号')}
              description={t('Choose a suggestion or enter a custom model', 'Pilih cadangan atau masukkan model sendiri', '选择建议或输入自定义型号')}
              customLabel={t('Use custom model', 'Gunakan model sendiri', '使用自定义型号')}
              searchPlaceholder={t('Search or enter a model...', 'Cari atau masukkan model...', '搜索或输入型号…')}
              value={formData.model}
              onChange={(value) => handleChange('model', canonicalizeSuggestion(value, modelSuggestions))}
              options={modelSuggestions}
              placeholder={isPrimeMover
                ? 'e.g. FH16, FMX, G450, Quester, GIGA'
                : isContainerChassis
                  ? 'e.g. 3-Axle Skeletal Chassis'
                  : t('Optional model or series', 'Model atau siri pilihan', '可选型号或系列')}
            />
          </div>
        </div>

        {isContainerChassis ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('Container Length', 'Panjang Kontena', '集装箱长度')} *</Label>
              <MobileSelect
                value={formData.containerLength}
                onChange={(event) => handleChange('containerLength', event.target.value)}
                title={t('Select container length', 'Pilih panjang kontena', '选择集装箱长度')}
                description={t('Choose the supported container length', 'Pilih panjang kontena yang disokong', '选择支持的集装箱长度')}
                className={fieldClass}
              >
                <option value="">{t('Select container length', 'Pilih panjang kontena', '选择集装箱长度')}</option>
                {containerLengths.map((length) => <option key={length} value={length}>{length}</option>)}
              </MobileSelect>
            </div>
            <div className="space-y-2">
              <Label>{t('Axle Configuration', 'Konfigurasi Gandar', '车轴配置')} *</Label>
              <MobileSelect
                value={formData.axleConfiguration}
                onChange={(event) => handleChange('axleConfiguration', event.target.value)}
                title={t('Select axle configuration', 'Pilih konfigurasi gandar', '选择车轴配置')}
                description={t('Choose the chassis axle configuration', 'Pilih konfigurasi gandar casis', '选择底盘车轴配置')}
                className={fieldClass}
              >
                <option value="">{t('Select axle configuration', 'Pilih konfigurasi gandar', '选择车轴配置')}</option>
                {axleConfigurations.map((configuration) => <option key={configuration} value={configuration}>{configuration}</option>)}
              </MobileSelect>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {showMileage ? (
            <TextField
              label={t('Current Mileage', 'Perbatuan Semasa', '当前里程')}
              value={formData.mileage}
              onChange={(value) => handleChange('mileage', value)}
              placeholder="e.g. 125000"
              type="number"
              min={0}
              numericOnly
            />
          ) : null}
          <div className={showMileage ? '' : 'sm:col-span-2'}>
            <TextField label={t('Chassis / VIN No.', 'No. Casis / VIN', '底盘 / VIN 号码')} value={formData.chassisNo} onChange={(value) => handleChange('chassisNo', value)} placeholder={t('Optional', 'Pilihan', '选填')} uppercase />
          </div>
        </div>
        {showEngineNumber ? (
          <TextField label={t('Engine No.', 'No. Enjin', '发动机号')} value={formData.engineNo} onChange={(value) => handleChange('engineNo', value)} placeholder={t('Optional', 'Pilihan', '选填')} uppercase />
        ) : null}

        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <FileText className="h-5 w-5 text-[#2563eb]" />
              {t('Compliance Documents', 'Dokumen Pematuhan', '车辆证件')}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {t('PDF or image, maximum 10 MB. Documents require admin approval.', 'PDF atau imej, maksimum 10 MB. Dokumen memerlukan kelulusan admin.', '支持 PDF 或图片，最大 10 MB；文件需管理员审核。')}
            </p>
          </div>
          <DateField label={t('Insurance Expiry', 'Tamat Insurans', '保险到期')} value={formData.insuranceExpiry} onChange={(value) => handleChange('insuranceExpiry', value)} />
          <DocumentField label={t('Insurance Document', 'Dokumen Insurans', '保险文件')} file={documents.insurance} existing={Boolean(editingVehicle?.insuranceExpiry)} required onChange={(file) => setDocuments((previous) => ({ ...previous, insurance: file }))} />
          <DateField label={t('Road Tax Expiry', 'Tamat Cukai Jalan', '路税到期')} value={formData.roadTaxExpiry} onChange={(value) => handleChange('roadTaxExpiry', value)} />
          <DocumentField label={t('Road Tax Document', 'Dokumen Cukai Jalan', '路税文件')} file={documents.roadTax} existing={Boolean(editingVehicle?.roadTaxExpiry)} required onChange={(file) => setDocuments((previous) => ({ ...previous, roadTax: file }))} />
          <DateField label={t('PUSPAKOM Expiry', 'Tamat PUSPAKOM', 'PUSPAKOM 到期')} value={formData.puspakomExpiry} onChange={(value) => handleChange('puspakomExpiry', value)} />
          <DocumentField label={t('PUSPAKOM Document', 'Dokumen PUSPAKOM', 'PUSPAKOM 文件')} file={documents.puspakom} existing={Boolean(editingVehicle?.puspakomExpiry)} onChange={(file) => setDocuments((previous) => ({ ...previous, puspakom: file }))} />
        </div>

        <div className="pt-4 pb-6">
          <Button onClick={handleSubmit} disabled={isSaving} className="w-full h-12 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-lg font-medium disabled:opacity-60">
            {isSaving
              ? t('Saving...', 'Menyimpan...', '保存中…')
              : editingVehicle?.verificationStatus === 'rejected'
                ? t('Re-submit for Verification', 'Hantar Semula untuk Pengesahan', '重新提交审核')
                : t('Save Vehicle', 'Simpan Kenderaan', '保存车辆')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  required = false,
  uppercase = false,
  numericOnly = false,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  uppercase?: boolean;
  numericOnly?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}{required ? ' *' : ''}</Label>
      <Input
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const nextValue = uppercase ? event.target.value.toUpperCase() : event.target.value;
          if (!numericOnly || /^\d*$/.test(nextValue)) onChange(nextValue);
        }}
        onBlur={() => {
          if (uppercase) {
            onChange(value.trim().toUpperCase());
          }
        }}
        placeholder={placeholder || label}
        className={`h-12 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 ${uppercase ? 'uppercase' : ''}`}
      />
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <MobileDatePicker
        value={value}
        onChange={onChange}
        ariaLabel={`${t('Choose', 'Pilih', '选择')} ${label.toLowerCase()}`}
        title={t('Pick a date', 'Pilih tarikh', '选择日期')}
        emptyDescription={t('Choose a day from the calendar', 'Pilih hari daripada kalendar', '从日历中选择日期')}
        clearLabel={t('Clear', 'Padam', '清除')}
        todayLabel={t('Today', 'Hari ini', '今天')}
      />
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentField({ label, file, required = false, existing = false, onChange }: {
  label: string;
  file?: File;
  required?: boolean;
  existing?: boolean;
  onChange: (file?: File) => void;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onChange(undefined);
  };

  return (
    <div className="space-y-2">
      <Label>{label}{required ? ' *' : ''}</Label>
      <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors ${
        file
          ? 'border-blue-400 bg-blue-50/50 text-slate-900 hover:bg-blue-50'
          : existing
          ? 'border-emerald-300 bg-emerald-50/40 text-emerald-800 hover:bg-emerald-50'
          : 'border-blue-300 bg-white text-slate-700 hover:bg-blue-50'
      }`}>
        <Upload className="h-5 w-5 shrink-0 text-[#2563eb]" />
        <div className="min-w-0 flex-1">
          {file ? (
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-slate-800">{file.name}</span>
              <span className="shrink-0 text-xs text-slate-500 font-normal">({formatFileSize(file.size)})</span>
            </div>
          ) : existing ? (
            <span className="text-emerald-700 font-medium">{t('Document on record (Click to replace)', 'Dokumen dalam rekod (Klik untuk ganti)', '已有证件记录（点击可替换）')}</span>
          ) : (
            <span className="text-slate-500">{t('Choose PDF or image', 'Pilih PDF atau imej', '选择 PDF 或图片')}</span>
          )}
        </div>
        {file ? (
          <button
            type="button"
            onClick={handleClear}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors"
            title={t('Remove file', 'Padam fail', '删除文件')}
            aria-label={t('Remove file', 'Padam fail', '删除文件')}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected && selected.size > 10 * 1024 * 1024) {
              toast.error(t('Document must be smaller than 10 MB.', 'Dokumen mestilah kurang daripada 10 MB.', '文件必须小于 10 MB。'));
              event.target.value = '';
              return;
            }
            onChange(selected);
          }}
        />
      </label>
    </div>
  );
}
