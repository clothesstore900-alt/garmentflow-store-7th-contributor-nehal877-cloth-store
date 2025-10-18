import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, Download, Trash2, XCircle, Search, CalendarIcon, Filter, Edit } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { CreateInvoiceDialog } from "@/components/Invoices/CreateInvoiceDialog";
import { InvoiceViewDialog } from "@/components/Invoices/InvoiceViewDialog";
import { EditInvoiceDialog } from "@/components/Invoices/EditInvoiceDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Invoices() {
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [cancelSaleId, setCancelSaleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate, setFilterDate] = useState<Date | undefined>();
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'done' | 'pending'>('all');
  const [expectedDateFilter, setExpectedDateFilter] = useState<Date | undefined>();
  const queryClient = useQueryClient();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: storeSettings } = useQuery({
    queryKey: ["store-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*").maybeSingle();
      if (error) throw error;
      
      // If no settings exist, create default settings
      if (!data) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");
        
        const { data: newSettings, error: createError } = await supabase
          .from("store_settings")
          .insert({
            store_name: "My Garment Store",
            currency_symbol: "₹",
            tax_percentage: 18
          })
          .select()
          .single();
          
        if (createError) throw createError;
        return newSettings;
      }
      
      return data;
    },
  });

  const downloadPDF = async (invoiceId: string) => {
    try {
      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (invError) throw invError;

      const { data: items, error: itemsError } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId);

      if (itemsError) throw itemsError;

      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      
      // Store Logo (left side)
      if (storeSettings?.logo_url) {
        try {
          const img = new Image();
          img.src = storeSettings.logo_url;
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
          pdf.addImage(img, 'PNG', 15, 10, 30, 30);
        } catch (error) {
          console.error('Failed to load logo:', error);
        }
      }
      
      // Store Name (centered at top)
      pdf.setFontSize(24);
      pdf.setFont(undefined, 'bold');
      pdf.text(storeSettings?.store_name || "Store", pageWidth / 2, 20, { align: "center" });
      
      // Store details (centered below name)
      pdf.setFontSize(9);
      pdf.setFont(undefined, 'normal');
      let detailsY = 27;
      if (storeSettings?.address) {
        pdf.text(storeSettings.address, pageWidth / 2, detailsY, { align: "center" });
        detailsY += 5;
      }
      if (storeSettings?.phone || storeSettings?.email) {
        const contactInfo = [storeSettings?.phone, storeSettings?.email].filter(Boolean).join(" | ");
        pdf.text(contactInfo, pageWidth / 2, detailsY, { align: "center" });
      }

      // Invoice details (right side)
      pdf.setFontSize(14);
      pdf.setFont(undefined, 'bold');
      pdf.text("INVOICE", pageWidth - 15, 15, { align: "right" });
      pdf.setFontSize(9);
      pdf.setFont(undefined, 'normal');
      pdf.text(`#${invoice.invoice_number}`, pageWidth - 15, 22, { align: "right" });
      pdf.text(`Date: ${format(new Date(invoice.created_at), "PP")}`, pageWidth - 15, 28, { align: "right" });

      // Customer info
      let yPos = 50;
      if (invoice.customer_name) {
        pdf.setFontSize(12);
        pdf.text("Bill To:", 15, yPos);
        pdf.setFontSize(10);
        pdf.text(invoice.customer_name, 15, yPos + 6);
        if (invoice.customer_phone) pdf.text(invoice.customer_phone, 15, yPos + 12);
        yPos += 25;
      } else {
        yPos += 10;
      }

      // Items table header
      pdf.setFillColor(240, 240, 240);
      pdf.rect(15, yPos, pageWidth - 30, 8, "F");
      pdf.setFontSize(10);
      pdf.text("Product", 20, yPos + 5);
      pdf.text("Size", 85, yPos + 5);
      pdf.text("Color", 110, yPos + 5);
      pdf.text("Qty", 135, yPos + 5);
      pdf.text("Price", 155, yPos + 5);
      pdf.text("Total", pageWidth - 25, yPos + 5, { align: "right" });

      // Items
      yPos += 12;
      pdf.setFontSize(9);
      items?.forEach((item) => {
        pdf.text(item.product_name, 20, yPos);
        pdf.text(item.size_name || "-", 85, yPos);
        pdf.text(item.color_name || "-", 110, yPos);
        pdf.text(item.quantity.toString(), 135, yPos);
        pdf.text(item.unit_price.toString(), 155, yPos);
        pdf.text(item.total_price.toString(), pageWidth - 25, yPos, { align: "right" });
        yPos += 6;
      });

      // Totals
      yPos += 10;
      pdf.setFontSize(10);
      pdf.text("Subtotal:", pageWidth - 70, yPos);
      pdf.text(invoice.subtotal.toString(), pageWidth - 25, yPos, { align: "right" });

      if (invoice.discount_amount > 0) {
        yPos += 6;
        pdf.text("Discount:", pageWidth - 70, yPos);
        pdf.text(`-${invoice.discount_amount}`, pageWidth - 25, yPos, { align: "right" });
      }

      if (invoice.tax_amount > 0) {
        yPos += 6;
        pdf.text(`Tax (${invoice.tax_percentage}%):`, pageWidth - 70, yPos);
        pdf.text(invoice.tax_amount.toString(), pageWidth - 25, yPos, { align: "right" });
      }

      yPos += 8;
      pdf.setFontSize(12);
      pdf.setFont(undefined, "bold");
      pdf.text("Grand Total:", pageWidth - 70, yPos);
      pdf.text(invoice.grand_total.toString(), pageWidth - 25, yPos, { align: "right" });

      // Add QR codes and social media info at the bottom
      const pageHeight = pdf.internal.pageSize.getHeight();
      const bottomY = pageHeight - 55;

      if (storeSettings?.whatsapp_qr_url || storeSettings?.instagram_qr_url) {
        let qrX = 15;

        // WhatsApp Section
        if (storeSettings?.whatsapp_qr_url) {
          try {
            const img = new Image();
            img.src = storeSettings.whatsapp_qr_url;
            await new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            });
            pdf.addImage(img, 'PNG', qrX, bottomY, 25, 25);

            // WhatsApp icon (green circle with W)
            pdf.setFillColor(37, 211, 102);
            pdf.circle(qrX + 12.5, bottomY + 30, 3, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(6);
            pdf.setFont(undefined, 'bold');
            pdf.text('W', qrX + 11.5, bottomY + 31.5);

            // Tagline and channel name
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(7);
            pdf.setFont(undefined, 'bold');
            pdf.text(storeSettings.whatsapp_tagline || 'Join our WhatsApp', qrX + 12.5, bottomY + 36, { align: 'center' });
            if (storeSettings.whatsapp_channel_name) {
              pdf.setFontSize(6);
              pdf.setFont(undefined, 'normal');
              pdf.text(storeSettings.whatsapp_channel_name, qrX + 12.5, bottomY + 40, { align: 'center' });
            }

            qrX += 60;
          } catch (err) {
            console.error('WhatsApp QR load failed:', err);
          }
        }

        // Instagram Section
        if (storeSettings?.instagram_qr_url) {
          try {
            const img = new Image();
            img.src = storeSettings.instagram_qr_url;
            await new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            });
            pdf.addImage(img, 'PNG', qrX, bottomY, 25, 25);

            // Instagram icon (gradient circle with camera)
            const gradient = pdf.linearGradient({
              vector: [qrX + 9, bottomY + 27, qrX + 16, bottomY + 33],
              colors: [[245, 96, 64], [193, 53, 132]]
            });
            pdf.setFillColor(193, 53, 132);
            pdf.circle(qrX + 12.5, bottomY + 30, 3, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(6);
            pdf.setFont(undefined, 'bold');
            pdf.text('IG', qrX + 11, bottomY + 31.5);

            // Tagline and page ID
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(7);
            pdf.setFont(undefined, 'bold');
            pdf.text(storeSettings.instagram_tagline || 'Follow us on Instagram', qrX + 12.5, bottomY + 36, { align: 'center' });
            if (storeSettings.instagram_page_id) {
              pdf.setFontSize(6);
              pdf.setFont(undefined, 'normal');
              pdf.text(`@${storeSettings.instagram_page_id}`, qrX + 12.5, bottomY + 40, { align: 'center' });
            }
          } catch (err) {
            console.error('Instagram QR load failed:', err);
          }
        }
      }

      pdf.save(`Invoice-${invoice.invoice_number}.pdf`);
      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const handleViewInvoice = (invoiceId: string) => {
    setViewInvoiceId(invoiceId);
    setViewDialogOpen(true);
  };

  const deleteInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      // Delete invoice items first
      const { error: itemsError } = await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoiceId);
      
      if (itemsError) throw itemsError;

      // Delete invoice
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setDeleteInvoiceId(null);
    },
    onError: (error) => {
      console.error("Delete error:", error);
      toast.error("Failed to delete invoice");
    },
  });

  const cancelSale = useMutation({
    mutationFn: async (invoiceId: string) => {
      // Get invoice items to restore stock
      const { data: items, error: itemsError } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId);
      
      if (itemsError) throw itemsError;

      // Restore stock for each item
      for (const item of items || []) {
        if (item.product_id) {
          // Get current product stock
          const { data: product } = await supabase
            .from("products")
            .select("quantity_in_stock")
            .eq("id", item.product_id)
            .single();
          
          if (product) {
            // Restore stock
            await supabase
              .from("products")
              .update({ 
                quantity_in_stock: product.quantity_in_stock + item.quantity 
              })
              .eq("id", item.product_id);
          }
        }
      }

      // Delete invoice items
      const { error: deleteItemsError } = await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoiceId);
      
      if (deleteItemsError) throw deleteItemsError;

      // Delete invoice
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sale cancelled and stock restored");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales-today"] });
      queryClient.invalidateQueries({ queryKey: ["sales-month"] });
      queryClient.invalidateQueries({ queryKey: ["sales-year"] });
      queryClient.invalidateQueries({ queryKey: ["trending-today"] });
      queryClient.invalidateQueries({ queryKey: ["trending-month"] });
      queryClient.invalidateQueries({ queryKey: ["trending-year"] });
      queryClient.invalidateQueries({ queryKey: ["profit-today"] });
      queryClient.invalidateQueries({ queryKey: ["profit-month"] });
      queryClient.invalidateQueries({ queryKey: ["profit-year"] });
      setCancelSaleId(null);
    },
    onError: (error) => {
      console.error("Cancel sale error:", error);
      toast.error("Failed to cancel sale");
    },
  });

  return (
    <div className="space-y-6">
      <InvoiceViewDialog
        invoiceId={viewInvoiceId}
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
      />
      <EditInvoiceDialog
        invoiceId={editInvoiceId}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Invoices</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[250px]"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[200px] justify-start text-left font-normal",
                  !filterDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filterDate ? format(filterDate, "PP") : <span>Filter by date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={filterDate}
                onSelect={setFilterDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {filterDate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterDate(undefined)}
            >
              Clear
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal",
                  paymentStatusFilter === 'all' && !expectedDateFilter && "text-muted-foreground"
                )}
              >
                <Filter className="mr-2 h-4 w-4" />
                Payment Status
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <div className="flex gap-2">
                    <Button
                      variant={paymentStatusFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPaymentStatusFilter('all')}
                      className="flex-1"
                    >
                      All
                    </Button>
                    <Button
                      variant={paymentStatusFilter === 'done' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPaymentStatusFilter('done')}
                      className="flex-1"
                    >
                      Done
                    </Button>
                    <Button
                      variant={paymentStatusFilter === 'pending' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPaymentStatusFilter('pending')}
                      className="flex-1"
                    >
                      Pending
                    </Button>
                  </div>
                </div>
                {paymentStatusFilter === 'pending' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Expected Payment Date</label>
                    <Calendar
                      mode="single"
                      selected={expectedDateFilter}
                      onSelect={setExpectedDateFilter}
                      className="rounded-md border"
                    />
                    {expectedDateFilter && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpectedDateFilter(undefined)}
                        className="w-full"
                      >
                        Clear Date Filter
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {(paymentStatusFilter !== 'all' || expectedDateFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPaymentStatusFilter('all');
                setExpectedDateFilter(undefined);
              }}
            >
              Clear Filters
            </Button>
          )}
          <CreateInvoiceDialog />
        </div>
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Payment Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices?.filter((inv) => {
                const query = searchQuery.toLowerCase();
                const customerMatch = !searchQuery || inv.customer_name?.toLowerCase().includes(query);
                const dateMatch = !filterDate || format(new Date(inv.created_at), "PP") === format(filterDate, "PP");
                const paymentMatch = paymentStatusFilter === 'all' || (inv.payment_status || 'done') === paymentStatusFilter;
                const expectedDateMatch = !expectedDateFilter ||
                  (inv.expected_payment_date && format(new Date(inv.expected_payment_date), "PP") === format(expectedDateFilter, "PP"));
                return customerMatch && dateMatch && paymentMatch && expectedDateMatch;
              }).map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.customer_name || "-"}</TableCell>
                  <TableCell>{format(new Date(inv.created_at), "PP")}</TableCell>
                  <TableCell>₹{inv.grand_total}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium",
                      (inv.payment_status || 'done') === 'done'
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                    )}>
                      {(inv.payment_status || 'done') === 'done' ? 'Done' : 'Pending'}
                    </span>
                    {inv.payment_status === 'pending' && inv.expected_payment_date && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Due: {format(new Date(inv.expected_payment_date), "PP")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => handleViewInvoice(inv.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => downloadPDF(inv.id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditInvoiceId(inv.id); setEditDialogOpen(true); }}>
                      <Edit className="h-4 w-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteInvoiceId(inv.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setCancelSaleId(inv.id)}>
                      <XCircle className="h-4 w-4 text-orange-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {invoices?.length === 0 && (
        <p className="text-sm text-muted-foreground mt-4 text-center">
          No invoices yet. Create your first invoice to get started!
        </p>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteInvoiceId} onOpenChange={(open) => !open && setDeleteInvoiceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this invoice. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteInvoiceId && deleteInvoice.mutate(deleteInvoiceId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Sale Confirmation Dialog */}
      <AlertDialog open={!!cancelSaleId} onOpenChange={(open) => !open && setCancelSaleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the invoice and restore the product stock. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelSaleId && cancelSale.mutate(cancelSaleId)}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Cancel Sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
