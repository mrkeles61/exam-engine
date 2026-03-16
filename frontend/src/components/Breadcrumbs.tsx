import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-6" aria-label="Breadcrumb">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1.5">
            {idx > 0 && (
              <span className="text-gray-300 select-none">/</span>
            )}
            {isLast || !item.to ? (
              <span className={isLast ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to}
                className="text-primary-600 hover:text-primary-700 hover:underline transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
