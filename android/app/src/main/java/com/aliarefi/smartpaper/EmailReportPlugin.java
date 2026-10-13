package com.aliarefi.smartpaper;

import android.content.ActivityNotFoundException;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DiagnosticEmailPlugin")
public class EmailReportPlugin extends Plugin {
    private static final String SUPPORT_EMAIL = "arefi.ali90@gmail.com";
    private static final String EMAIL_SUBJECT = "Smart Paper problem report";
    private static final int MAX_EMAIL_BODY_CHARS = 131072;

    @PluginMethod
    public void openDraft(PluginCall call) {
        String body = call.getString("body");
        if (body == null) {
            call.reject("Unable to prepare the email draft.");
            return;
        }
        if (body.length() > MAX_EMAIL_BODY_CHARS) {
            call.reject("The report is too long to prepare for email.");
            return;
        }

        // mailto is opaque: hierarchical query builders discard its recipient.
        Uri emailUri = Uri.parse("mailto:" + SUPPORT_EMAIL
            + "?subject=" + Uri.encode(EMAIL_SUBJECT)
            + "&body=" + Uri.encode(body));
        Intent intent = new Intent(Intent.ACTION_SENDTO, emailUri);
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No email app is available to open this draft.");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(intent);
                call.resolve();
            } catch (RuntimeException exception) {
                if (exception instanceof ActivityNotFoundException || exception instanceof SecurityException) {
                    call.reject("No email app is available to open this draft.");
                    return;
                }
                call.reject("Unable to open the email draft.");
            }
        });
    }
}
