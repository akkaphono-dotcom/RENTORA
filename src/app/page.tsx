import Link from 'next/link';

export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-primary text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Find a place you can call home.</h1>
          <p className="text-xl md:text-2xl mb-8 opacity-90">ค้นหาบ้านเช่าที่เหมาะกับคุณ ในทำเลและราคาที่ต้องการ</p>
          
          <div className="bg-white rounded-lg p-4 max-w-4xl mx-auto flex flex-col md:flex-row gap-4 text-gray-900 shadow-lg">
            <input type="text" placeholder="Location (e.g. Hat Yai)" className="flex-1 p-3 border rounded-md" />
            <select className="flex-1 p-3 border rounded-md">
              <option>Property Type</option>
              <option>House</option>
              <option>Townhome</option>
              <option>Condo</option>
            </select>
            <input type="text" placeholder="Max Price" className="flex-1 p-3 border rounded-md" />
            <button className="bg-accent text-white px-8 py-3 rounded-md hover:bg-opacity-90 font-semibold">Search</button>
          </div>
        </div>
      </section>

      {/* Featured Properties */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-8 text-primary">Featured Properties</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300">
              <div className="h-48 bg-gray-300 relative">
                <div className="absolute top-4 left-4 bg-primary text-white text-xs font-bold px-2 py-1 rounded">FOR RENT</div>
              </div>
              <div className="p-4">
                <div className="text-sm text-secondary mb-1">House</div>
                <h3 className="text-xl font-bold mb-2">Modern House {item}</h3>
                <p className="text-gray-600 mb-4">Hat Yai, Songkhla</p>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-lg font-bold text-accent">฿12,000 / month</span>
                </div>
                <div className="flex text-sm text-gray-500 gap-4 mb-4">
                  <span>3 Beds</span>
                  <span>2 Baths</span>
                  <span>120 m²</span>
                </div>
                <Link href={`/properties/${item}`} className="block w-full text-center bg-gray-100 text-primary py-2 rounded hover:bg-gray-200 transition-colors">
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why Choose RENTORA */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-12 text-center text-primary">Why Choose RENTORA</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4 text-secondary font-bold">1</div>
              <h3 className="font-bold mb-2">Verified Properties</h3>
              <p className="text-gray-600 text-sm">Every property is verified for your safety.</p>
            </div>
            <div>
              <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4 text-secondary font-bold">2</div>
              <h3 className="font-bold mb-2">Easy Search</h3>
              <p className="text-gray-600 text-sm">Advanced filters to find your perfect match.</p>
            </div>
            <div>
              <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4 text-secondary font-bold">3</div>
              <h3 className="font-bold mb-2">Secure Communication</h3>
              <p className="text-gray-600 text-sm">Chat directly with landlords securely.</p>
            </div>
            <div>
              <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4 text-secondary font-bold">4</div>
              <h3 className="font-bold mb-2">Trusted Reviews</h3>
              <p className="text-gray-600 text-sm">Read reviews from real tenants.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <h2 className="text-3xl font-bold mb-6 text-primary">Ready to find your next home?</h2>
        <div className="flex justify-center gap-4">
          <Link href="/properties" className="bg-primary text-white px-8 py-3 rounded-md hover:bg-secondary font-semibold">
            Explore Properties
          </Link>
          <Link href="/register" className="bg-white text-primary border-2 border-primary px-8 py-3 rounded-md hover:bg-gray-50 font-semibold">
            List Your Property
          </Link>
        </div>
      </section>
    </div>
  );
}
