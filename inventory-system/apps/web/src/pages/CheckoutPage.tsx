import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "../lib/currency";
import { recordSaleLocal, Snapshot } from "../lib/data";
import { Product, Session } from "../types";

type CartItem = {
  product: Product;
  quantity: number;
};

type CheckoutPageProps = {
  snapshot: Snapshot;
  session: Session;
  onChange: () => void;
};

export default function CheckoutPage({ snapshot, session, onChange }: CheckoutPageProps) {
  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashReceived, setCashReceived] = useState("");
  const [status, setStatus] = useState("Ready for checkout.");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrame = useRef<number | null>(null);

  const inventoryMap = useMemo(() => {
    const map = new Map<string, number>();
    snapshot.inventory.forEach(item => map.set(item.productId, item.quantity));
    return map;
  }, [snapshot.inventory]);

  const productsByBarcode = useMemo(() => {
    const map = new Map<string, Product>();
    snapshot.products
      .filter(product => product.active)
      .forEach(product => {
        if (product.barcode) {
          map.set(product.barcode, product);
        }
      });
    return map;
  }, [snapshot.products]);

  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cash = Number(cashReceived || 0);
  const change = Math.max(0, cash - total);

  const addToCart = (product: Product) => {
    setCart(current => {
      const existing = current.find(item => item.product.id === product.id);
      const nextQuantity = (existing?.quantity ?? 0) + 1;
      const available = inventoryMap.get(product.id) ?? 0;

      if (available >= 0 && nextQuantity > available) {
        setStatus(`Only ${available} unit(s) available for ${product.name}.`);
        return current;
      }

      setStatus(`${product.name} added to cart.`);

      if (existing) {
        return current.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const handleBarcodeValue = (value: string) => {
    if (!value) {
      return;
    }

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
        .map(item => {
          if (item.product.id !== productId) {
            return item;
          }

          const nextQuantity = item.quantity + delta;
          const available = inventoryMap.get(productId) ?? 0;
          if (delta > 0 && nextQuantity > available) {
            setStatus(`Only ${available} unit(s) available for ${item.product.name}.`);
            return item;
          }

          return { ...item, quantity: nextQuantity };
        })
        .filter(item => item.quantity > 0)
    );
  };

  const handleCheckout = async () => {
    if (!cart.length) {
      return;
    }

    if (cash < total) {
      setStatus("Cash received is less than total.");
      return;
    }

    await recordSaleLocal({
      userId: session.user.id,
      items: cart.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.product.price
      })),
      paidAmount: cash
    });

    setCart([]);
    setCashReceived("");
    setStatus("Sale completed locally. Sync will push it to other devices.");
    onChange();
  };

  const stopScan = () => {
    setScanning(false);
    if (scanFrame.current) {
      cancelAnimationFrame(scanFrame.current);
      scanFrame.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const scanLoop = async () => {
    const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: any }).BarcodeDetector;
    if (!BarcodeDetectorCtor || !videoRef.current) {
      return;
    }

    try {
      const detector = new BarcodeDetectorCtor({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"]
      });
      const matches = await detector.detect(videoRef.current);
      if (matches.length > 0) {
        const value = matches[0].rawValue || "";
        if (value) {
          handleBarcodeValue(value);
          stopScan();
          return;
        }
      }
    } catch {
      setStatus("Camera scanning failed. Type the barcode or use a USB scanner.");
      stopScan();
      return;
    }

    scanFrame.current = requestAnimationFrame(scanLoop);
  };

  const startScan = async () => {
    const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: any }).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      setStatus("Barcode scanner is not supported in this browser.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera access is not available.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setScanning(true);
      setStatus("Scanning...");
      scanLoop();
    } catch {
      setStatus("Camera access denied.");
    }
  };

  useEffect(() => () => stopScan(), []);

  return (
    <div className="stack">
      <div className="section">
        <div className="section-head">
          <h3>Barcode Scan</h3>
          <span className="pill">Cash only</span>
        </div>
        <div className="action-row">
          <input
            placeholder="Scan or type barcode"
            value={barcode}
            onChange={event => setBarcode(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleBarcodeValue(barcode.trim());
              }
            }}
          />
          <button className="secondary" type="button" onClick={startScan}>Camera</button>
          <button className="primary" type="button" onClick={() => handleBarcodeValue(barcode.trim())}>Add</button>
        </div>
        {scanning && (
          <div className="scan-panel">
            <video ref={videoRef} autoPlay muted playsInline />
            <button className="secondary" type="button" onClick={stopScan}>Stop Scan</button>
          </div>
        )}
        <div className="notice">{status}</div>
      </div>

      <div className="page-columns">
        <div className="section">
          <div className="section-head">
            <h3>Cart</h3>
            <span className="pill">{cart.length} lines</span>
          </div>

          {cart.length === 0 ? (
            <p className="muted">No items yet.</p>
          ) : (
            <div className="compact-list">
              {cart.map(item => (
                <div key={item.product.id} className="list-row">
                  <div>
                    <strong>{item.product.name}</strong>
                    <div className="muted">{formatMoney(item.product.price)}</div>
                  </div>
                  <div className="action-row">
                    <button className="secondary" type="button" onClick={() => updateQty(item.product.id, -1)}>-</button>
                    <span>{item.quantity}</span>
                    <button className="secondary" type="button" onClick={() => updateQty(item.product.id, 1)}>+</button>
                  </div>
                  <div>{formatMoney(item.product.price * item.quantity)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-head">
            <h3>Payment</h3>
            <span className="pill">{session.user.role}</span>
          </div>
          <div className="stack">
            <div>
              <label>Total</label>
              <input value={formatMoney(total)} readOnly />
            </div>
            <div>
              <label>Cash Received</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cashReceived}
                onChange={event => setCashReceived(event.target.value)}
              />
            </div>
            <div>
              <label>Change</label>
              <input value={formatMoney(change)} readOnly />
            </div>
            <button className="primary" type="button" onClick={handleCheckout}>Complete Sale</button>
          </div>
        </div>
      </div>
    </div>
  );
}
