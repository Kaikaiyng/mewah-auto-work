package com.mewahautowork.customer;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void print(String documentName) {
                        runOnUiThread(() -> {
                            try {
                                PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                                if (printManager != null) {
                                    String jobName = (documentName != null && !documentName.isEmpty())
                                            ? documentName
                                            : ("Document_" + System.currentTimeMillis());
                                    PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(jobName);
                                    printManager.print(jobName, printAdapter, new PrintAttributes.Builder().build());
                                }
                            } catch (Exception e) {
                                e.printStackTrace();
                            }
                        });
                    }
                }, "AndroidPrinter");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

