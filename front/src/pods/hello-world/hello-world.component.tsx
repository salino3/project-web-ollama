import React from 'react';
import './hello-world.styles.scss';

export const HelloWorldComponent: React.FC = () => {
  return (
    <div className="container">
      <h1>Hello from Pods!</h1>
      <p>This component demonstrates the project structure.</p>
    </div>
  );
};
