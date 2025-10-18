import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EditInvoiceDialogProps {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditInvoiceDialog({ invoiceId, open, onOpenChange }: EditInvoiceDialogProps) {
  const [paymentStatus, setPaymentStatus] = useState<'done' | 'pending'>('pending');
  const [expectedPaymentDate, setExpectedPaymentDate] = useState<Date | undefined>();
  const queryClient = useQueryClient();

  const { data: invoice } = useQuery({
    queryKey: ["invoice-edit", invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null;
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!invoiceId && open,
  });

  useEffect(() => {
    if (invoice) {
      setPaymentStatus(invoice.payment_status || 'pending');
      if (invoice.expected_payment_date) {
        setExpectedPaymentDate(new Date(invoice.expected_payment_date));
      } else {
        setExpectedPaymentDate(undefined);
      }
    }
  }, [invoice]);

  const updatePaymentStatus = useMutation({
    mutationFn: async () => {
      if (!invoiceId) throw new Error("No invoice ID");

      const { error } = await supabase
        .from("invoices")
        .update({
          payment_status: paymentStatus,
          expected_payment_date: paymentStatus === 'pending' && expectedPaymentDate
            ? format(expectedPaymentDate, 'yyyy-MM-dd')
            : null,
        })
        .eq("id", invoiceId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment status updated successfully");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-edit", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["sales-today"] });
      queryClient.invalidateQueries({ queryKey: ["sales-month"] });
      queryClient.invalidateQueries({ queryKey: ["sales-year"] });
      queryClient.invalidateQueries({ queryKey: ["trending-today"] });
      queryClient.invalidateQueries({ queryKey: ["trending-month"] });
      queryClient.invalidateQueries({ queryKey: ["trending-year"] });
      queryClient.invalidateQueries({ queryKey: ["profit-today"] });
      queryClient.invalidateQueries({ queryKey: ["profit-month"] });
      queryClient.invalidateQueries({ queryKey: ["profit-year"] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Update error:", error);
      toast.error("Failed to update payment status");
    },
  });

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Payment Status - {invoice.invoice_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium">{invoice.customer_name || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Amount:</span>
                <span className="font-bold text-lg">₹{Number(invoice.grand_total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Status:</span>
                <span className={cn(
                  "font-medium capitalize px-2 py-0.5 rounded text-xs",
                  invoice.payment_status === 'done'
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                )}>
                  {invoice.payment_status}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="paymentStatus">Update Payment Status</Label>
              <Select value={paymentStatus} onValueChange={(v: 'done' | 'pending') => setPaymentStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="done">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span>Paid (Done)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="pending">
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 text-yellow-600">⏱</span>
                      <span>Pending</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentStatus === 'pending' && (
              <div>
                <Label>Expected Payment Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !expectedPaymentDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expectedPaymentDate ? format(expectedPaymentDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={expectedPaymentDate}
                      onSelect={setExpectedPaymentDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {paymentStatus === 'done' && invoice.payment_status === 'pending' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700">
                  ✓ This invoice will be added to your total sales after updating.
                </p>
              </div>
            )}

            {paymentStatus === 'pending' && invoice.payment_status === 'done' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-700">
                  ⚠ This invoice will be removed from your total sales after updating.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updatePaymentStatus.mutate()}
              disabled={updatePaymentStatus.isPending}
            >
              {updatePaymentStatus.isPending ? "Updating..." : "Update Status"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
