import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="text-2xl font-bold text-primary">
              RENTORA
            </Link>
          </div>
          <div className="hidden md:flex space-x-8">
            <Link href="/" className="text-gray-700 hover:text-primary">Home</Link>
            <Link href="/properties" className="text-gray-700 hover:text-primary">Browse Homes</Link>
            <Link href="/about" className="text-gray-700 hover:text-primary">About</Link>
            <Link href="/contact" className="text-gray-700 hover:text-primary">Contact</Link>
          </div>
          <div className="hidden md:flex items-center space-x-4">
            <Link href="/login" className="text-gray-700 hover:text-primary">Login</Link>
            <Link href="/register" className="bg-primary text-white px-4 py-2 rounded-md hover:bg-secondary">
              Register
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
