package com.aliarefi.smartpaper;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(EmailReportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
