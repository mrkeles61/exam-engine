import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

interface Props {
  children: ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const token = localStorage.getItem('access_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
