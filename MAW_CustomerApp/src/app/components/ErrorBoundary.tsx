import React from 'react';
import { useRouteError, useNavigate } from 'react-router';
import { AlertCircle, Home } from 'lucide-react';
import { Button } from './ui/button';

export function ErrorBoundary() {
  const error = useRouteError() as any;
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#eef3fb] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h1>
        <p className="text-gray-600 mb-6">
          {error?.statusText || error?.message || 'Something went wrong'}
        </p>
        <Button
          onClick={() => navigate('/home')}
          className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl"
        >
          <Home className="w-4 h-4 mr-2" />
          Go to Home
        </Button>
      </div>
    </div>
  );
}
