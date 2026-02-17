import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { HelloWorldComponent } from '../pods/hello-world/hello-world.component';

export const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HelloWorldComponent />} />
    </Routes>
  );
};
