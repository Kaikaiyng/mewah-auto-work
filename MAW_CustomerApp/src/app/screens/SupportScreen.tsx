import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Phone, MessageCircle, Mail, MapPin, Send, Clock } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DEFAULT_SUPPORT_SETTINGS, getSupportSettings } from '../lib/api';
import type { SupportSettings } from '../types';
import logo from 'figma:asset/9579c9865ae700123383ca50bc26e6829232a00d.png';

export function SupportScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data } = useCustomerData();
  const [supportInfo, setSupportInfo] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data?.systemSettings?.support) {
      setSupportInfo(data.systemSettings.support);
    } else {
      void getSupportSettings().then(setSupportInfo);
    }
  }, [data]);

  const supportPhone = data?.systemSettings?.support?.phone || supportInfo.phone || DEFAULT_SUPPORT_SETTINGS.phone;
  const supportWhatsapp = data?.systemSettings?.support?.whatsapp || supportInfo.whatsapp || DEFAULT_SUPPORT_SETTINGS.whatsapp;
  const supportEmail = data?.systemSettings?.support?.email || supportInfo.email || DEFAULT_SUPPORT_SETTINGS.email;
  const operatingHours = data?.systemSettings?.support?.operatingHours || data?.systemSettings?.company?.operatingHours || supportInfo.operatingHours || DEFAULT_SUPPORT_SETTINGS.operatingHours;
  
  const companyName = data?.systemSettings?.company?.legalName || supportInfo.company?.legalName || 'MEWAH AUTOWORKS SDN BHD';
  const companyAddress = data?.systemSettings?.company?.address || supportInfo.company?.address || 'Configure your workshop address';
  const companyPhone = data?.systemSettings?.company?.phone || supportInfo.company?.phone || supportPhone;

  const whatsappDigits = (supportWhatsapp || '').replace(/\D/g, '') || (supportPhone || '').replace(/\D/g, '') || '60123456789';

  const handleSendMessage = () => {
    if (message.trim()) {
      window.location.href = `mailto:${supportEmail}?subject=Customer%20App%20Support&body=${encodeURIComponent(message)}`;
    }
  };

  const contactOptions = [
    {
      icon: Phone,
      title: t('Call Us', '致电我们'),
      subtitle: supportPhone,
      action: t('Call Now', '立即拨打'),
      color: 'bg-blue-500',
      link: `tel:${supportPhone}`
    },
    {
      icon: MessageCircle,
      title: t('WhatsApp', 'WhatsApp'),
      subtitle: supportWhatsapp,
      action: t('Open WhatsApp', '打开WhatsApp'),
      color: 'bg-green-500',
      link: `https://wa.me/${whatsappDigits}`
    },
    {
      icon: Mail,
      title: t('Email', '电子邮件'),
      subtitle: supportEmail,
      action: t('Send Email', '发送邮件'),
      color: 'bg-purple-500',
      link: `mailto:${supportEmail}`
    }
  ];

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors cursor-pointer"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {t('Contact Support', 'Hubungi Sokongan', '联系客服')}
        </h1>
        <div className="w-10" />
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">
        {/* Company Logo and Info */}
        <div className="flex justify-center mb-4">
          <img src={logo} alt="Mewah AutoWorks" className="h-16 w-auto" />
        </div>
        
        {/* Quick Contact Options */}
        <div className="space-y-3">
          {contactOptions.map((option, index) => {
            const Icon = option.icon;
            return (
              <Card key={index} className="rounded-2xl shadow-md border-0">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-12 h-12 ${option.color} rounded-xl flex items-center justify-center`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{option.title}</h3>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{option.subtitle}</p>
                    </div>
                  </div>
                  <a href={option.link} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full h-11 rounded-xl cursor-pointer" variant="outline">
                      {option.action}
                    </Button>
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Send Message */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">
              {t('Send us a message', '给我们留言')}
            </h3>
            <Textarea
              placeholder={t(
                'Type your message here...',
                '在此输入您的消息...'
              )}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-32 rounded-xl mb-4"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!message.trim()}
              className="w-full h-11 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-5 h-5 mr-2" />
              {t('Send Message', '发送消息')}
            </Button>
          </CardContent>
        </Card>

        {/* Service Centres */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <MapPin className="w-5 h-5 text-[#2563eb]" />
              <h3 className="font-semibold">
                {t('Our Service Centre', '我们的服务中心')}
              </h3>
            </div>
            <div>
              <p className="font-medium text-gray-800">
                {companyName}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {companyAddress}
              </p>
              <p className="text-sm text-[#2563eb] mt-1">
                {t('Tel:', '电话:')} {companyPhone}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Business Hours */}
        <Card className="rounded-2xl shadow-md border-0 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-[#2563eb]" />
              <h3 className="font-semibold text-[#2563eb]">
                {t('Business Hours', '营业时间')}
              </h3>
            </div>
            <div className="text-sm text-gray-700">
              <p className="font-medium text-gray-800">{operatingHours}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
