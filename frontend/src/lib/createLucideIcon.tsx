'use client';

/**
 * Lucide Icon Utility Component
 * 
 * Provides a consistent interface for using Lucide icons across the ARWAYS TMS application.
 * Follows the createLucideIcon-BBBWireT.js naming convention.
 * 
 * All icons use:
 * - stroke width: 2 (consistent with minimal design)
 * - stroke linecap: round
 * - stroke linejoin: round
 * - no fill (clean, outlined style)
 */

import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Re-export all Lucide icons for direct usage
export { LucideIcons };

/**
 * Creates a memoized icon component with consistent styling
 * @param Icon - The Lucide icon component to wrap
 * @param size - Icon size (default: 24)
 * @param strokeWidth - Stroke width (default: 2 for minimal design)
 * @returns A React component that renders the icon with consistent styling
 */
export function createLucideIcon(
  Icon: LucideIcon,
  size: number = 24,
  strokeWidth: number = 2
) {
  return function LucideIconComponent({ className = '' }: { className?: string }) {
    return <Icon size={size} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} />;
  };
}

/**
 * Pre-defined icon components with consistent styling
 * These should be used throughout the application for visual consistency
 */
export const Icons = {
  Logo: createLucideIcon(LucideIcons.Truck, 32, 2.5),
  Dashboard: createLucideIcon(LucideIcons.LayoutDashboard, 20),
  Orders: createLucideIcon(LucideIcons.Package, 20),
  Fleet: createLucideIcon(LucideIcons.Truck, 20),
  Users: createLucideIcon(LucideIcons.Users, 20),
  Reports: createLucideIcon(LucideIcons.ChartBar, 20),
  Settings: createLucideIcon(LucideIcons.Settings, 20),
  Check: createLucideIcon(LucideIcons.Check, 18),
  X: createLucideIcon(LucideIcons.X, 18),
  Alert: createLucideIcon(LucideIcons.AlertCircle, 18),
  Clock: createLucideIcon(LucideIcons.Clock, 18),
  Calendar: createLucideIcon(LucideIcons.Calendar, 18),
  MapPin: createLucideIcon(LucideIcons.MapPin, 18),
  Search: createLucideIcon(LucideIcons.Search, 18),
  Filter: createLucideIcon(LucideIcons.Filter, 18),
  Plus: createLucideIcon(LucideIcons.Plus, 18),
  Edit: createLucideIcon(LucideIcons.Edit, 18),
  Trash: createLucideIcon(LucideIcons.Trash2, 18),
  Upload: createLucideIcon(LucideIcons.Upload, 18),
  Download: createLucideIcon(LucideIcons.Download, 18),
  Refresh: createLucideIcon(LucideIcons.RefreshCw, 18),
  User: createLucideIcon(LucideIcons.User, 18),
  UserCheck: createLucideIcon(LucideIcons.UserCheck, 18),
  UserPlus: createLucideIcon(LucideIcons.UserPlus, 18),
  AlertTriangle: createLucideIcon(LucideIcons.AlertTriangle, 18),
  Info: createLucideIcon(LucideIcons.Info, 18),
  CheckCircle: createLucideIcon(LucideIcons.CheckCircle, 18),
  XCircle: createLucideIcon(LucideIcons.XCircle, 18),
  ChevronLeft: createLucideIcon(LucideIcons.ChevronLeft, 18),
  ChevronRight: createLucideIcon(LucideIcons.ChevronRight, 18),
  ChevronDown: createLucideIcon(LucideIcons.ChevronDown, 18),
  ChevronUp: createLucideIcon(LucideIcons.ChevronUp, 18),
  Circle: createLucideIcon(LucideIcons.Circle, 12),
  Square: createLucideIcon(LucideIcons.Square, 12),
  // Direct aliases used across pages (same styling as the named variants above)
  Truck: createLucideIcon(LucideIcons.Truck, 18),
  Package: createLucideIcon(LucideIcons.Package, 18),
  Map: createLucideIcon(LucideIcons.Map, 18),
  Lock: createLucideIcon(LucideIcons.Lock, 18),
  AlertCircle: createLucideIcon(LucideIcons.AlertCircle, 18),
  ChartBar: createLucideIcon(LucideIcons.ChartBar, 18),
  Eye: createLucideIcon(LucideIcons.Eye, 18),
  EyeOff: createLucideIcon(LucideIcons.EyeOff, 18),
  Bell: createLucideIcon(LucideIcons.Bell, 18),
  Phone: createLucideIcon(LucideIcons.Phone, 18),
  Mail: createLucideIcon(LucideIcons.Mail, 18),
  Moon: createLucideIcon(LucideIcons.Moon, 18),
  Sun: createLucideIcon(LucideIcons.Sun, 18),
  Help: createLucideIcon(LucideIcons.HelpCircle, 18),
  Audit: createLucideIcon(LucideIcons.ClipboardList, 18),
  CalendarDays: createLucideIcon(LucideIcons.CalendarDays, 18),
  Kanban: createLucideIcon(LucideIcons.KanbanSquare, 18),
  Route: createLucideIcon(LucideIcons.Route, 18),
  Client: createLucideIcon(LucideIcons.Building2, 18),
  Proof: createLucideIcon(LucideIcons.Camera, 18),
  Monitor: createLucideIcon(LucideIcons.Activity, 18),
  Approval: createLucideIcon(LucideIcons.CheckSquare, 18),
  Broadcast: createLucideIcon(LucideIcons.Megaphone, 18),
};

export type IconComponent = React.FC<{ className?: string }>;
