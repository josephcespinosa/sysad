var google;

async function importEmployees(req, res) {
    const { bucketId, objectId } = req.body.message.attributes;
    google = google || require('googleapis').google;

    const sqladmin =  google.sqladmin('v1beta4');

    try {
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const authClient = await auth.getClient();

        google.options({auth: authClient});

        const response = await sqladmin.instances.import({
            instance: process.env.DB_INSTANCE,
            project: process.env.PROJECT_ID,
            requestBody: {
                "importContext": {
                    "fileType": "CSV",
                    "uri": `gs://${bucketId}/${objectId}`,
                    "database": process.env.DB_NAME,
                    "csvImportOptions": {
                        "table": process.env.TARGET_TABLE,
                        "columns": [
                            "employee_code",
                            "company_code",
                            "account_type",
                            "site_assignment",
                            "job_code",
                            "job_grade_level",
                            "team_code",
                            "employment_type_code",
                            "employment_status_code",
                            "city_code",
                            "phase",
                            "gender",
                            "marital_status"
                        ]
                    }
                }
            }
        });

        res.status(200).json({
            status: 200,
            message: response
        });
    } catch(err) {
        console.error(err);

        res.status(500).json({
            status: 500,
            message: err
        });
    }
}

module.exports = {
    importEmployees
}