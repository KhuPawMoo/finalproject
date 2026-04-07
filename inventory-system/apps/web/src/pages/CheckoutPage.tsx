import React, { useEffect, useMemo, useRef, useState } from "react";
import { recordSaleLocal, Snapshot } from "../lib/data";
import { Product } from "../types";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

type CartItem = {
  product: Product;
  quantity: number;
};

export default function CheckoutPage({ snapshot, onChange }: { snapshot: Snapshot; onChange: () => void }) {
  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashReceived, setCashReceived] = useState("");
  const [status, setStatus] = useState("Ready for checkout.");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrame = useRef<number | null>(null);

  const productsByBarcode = useMemo(() => {
    const map = new Map<string, Product>();
    snapshot.products.forEach(product => {
      if (product.barcode) map.set(product.barcode, product);
    });
    return map;
  }, [snapshot.products]);

  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cash = Number(cashReceived || 0);
  const change = Math.max(0, cash - total);

  const addToCart = (product: Product) => {
    setCart(current => {
      const existing = current.find(item => item.product.id === product.id);
      if (existing) {
        return current.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const handleBarcodeValue = (value: string) => {
    if (!value) return;
    const product = productsByBarcode.get(value);
    if (!product) {
      setStatus("Barcode not found.");
      return;
    }
    addToCart(product);
    setBarcode("");
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(current =>
      current
        .map(item =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(1, item.quantity + delta) }
            : item
        )
        .filter(item => item.quantity > 0)
    );
  };

  const handleCheckout = async () => {
    if (!cart.length) return;
    if (cash < total) {
      setStatus("Cash received is less than total.");
      return;
    }

    await recordSaleLocal({
      userId: "local-user",
      items: cart.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.product.price
      })),
      paidAmount: cash
    });

    setCart([]);
    setCashReceived("");
    setStatus("Sale completed.");
    onChange();
  };

  const stopScan = () => {
    setScanning(false);
    if (scanFrame.current) cancelAnimationFrame(scanFrame.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const scanLoop = async () => {
    const detector = (window as any).BarcodeDetector;
    if (!detector || !videoRef.current) return;

    try {
      const instance = new detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"]
      });
      const barcodes = await instance.detect(videoRef.current);
      if (barcodes.length > 0) {
        const value = barcodes[0].rawValue || "";
        if (value) {
          handleBarcodeValue(value);
          stopScan();
        }
      }
    } catch {
      // ignore
    }

    scanFrame.current = requestAnimationFrame(scanLoop);
  };

  const startScan = async () => {
    const detector = (window as any).BarcodeDetector;
    if (!detector) {
      setStatus("Barcode scanner not supported. Use a USB scanner or type the code.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera access not available.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanning(true);
      scanLoop();
    } catch {
      setStatus("Camera access denied.");
    }
  };

  useEffect(() => () => stopScan(), []);

  return (
    <div>
      <div className="section">
        <h3>Scan or Type Barcode</h3>
        <div className="inline">
          <input
            placeholder="Scan or type barcode"
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleBarcodeValue(barcode.trim())}
          />
          <button className="secondary" type="button" onClick={startScan}>Camera</button>
          <button className="primary" type="button" onClick={() => handleBarcodeValue(barcode.trim())}>Add</button>
        </div>
        {scanning && (
          <div style={{ marginTop: 12 }}>
            <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", borderRadius: 12 }} />
            <button className="secondary" type="button" onClick={stopScan} style={{ marginTop: 8 }}>
              Stop Scan
            </button>
          </div>
        )}
      </div>

      <div className="section">
        <h3>Cart</h3>
        {cart.length === 0 ? (
          <p className="muted">No items yet.</p>
        ) : (
          <div className="cart">
            {cart.map(item => (
              <div key={item.product.id} className="cart-row">
                <div>
                  <strong>{item.product.name}</strong>
                  <div className="muted">{formatMoney(item.product.price)}</div>
                </div>
                <div className="inline">
                  <button className="secondary" onClick={() => updateQty(item.product.id, -1)}>-</button>
                  <span>{item.quantity}</span>
                  <button className="secondary" onClick={() => updateQty(item.product.id, 1)}>+</button>
                </div>
                <div>{formatMoney(item.product.price * item.quantity)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <h3>Payment</h3>
        <div className="form-grid">
          <div>
            <label>Total</label>
            <input value={formatMoney(total)} readOnly />
          </div>
          <div>
            <label>Cash Received</label>
            <input type="number" min="0" step="0.01" value={cashReceived} onChange={e => setCashReceived(e.target.value)} />
          </div>
          <div>
            <label>Change</label>
            <input value={formatMoney(change)} readOnly />
          </div>
        </div>
        <div className="inline" style={{ marginTop: 12 }}>
          <button className="primary" type="button" onClick={handleCheckout}>Complete Sale</button>
          <span className="muted">{status}</span>
        </div>
      </div>
    </div>
  );
}
