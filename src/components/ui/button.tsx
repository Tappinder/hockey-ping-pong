import React from 'react';

export const Button = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  return (
    <button
      {...props}
      style={{
        padding: '10px 20px',
        margin: '10px',
        borderRadius: '5px',
        border: 'none',
        background: '#ff4500',
        color: 'white',
        fontSize: '16px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
};
