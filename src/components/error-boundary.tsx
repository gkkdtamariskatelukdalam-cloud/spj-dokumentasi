"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary — catches runtime errors in React components.
 * Prevents blank white screen when a component crashes.
 * Shows a friendly error message with a "Try Again" button.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full space-y-4 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold text-foreground">
                Terjadi Kesalahan
              </h1>
              <p className="text-sm text-muted-foreground">
                Aplikasi mengalami error. Anda bisa mencoba lagi atau
 memuat ulang halaman.
              </p>
            </div>
            {this.state.error && (
              <details className="text-left text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                <summary className="cursor-pointer font-medium">
                  Detail Error
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={this.handleReset}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Coba Lagi
              </Button>
              <Button onClick={this.handleReload}>
                Muat Ulang
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
