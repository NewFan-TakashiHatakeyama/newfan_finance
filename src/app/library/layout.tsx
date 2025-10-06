import { Metadata } from 'next';
import React from 'react';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Library - NewFan-Finance',
};

export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div>{children}</div>;
}
